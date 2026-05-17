// ============================================================
// api/deliver-account.js
// Endpoint appelé par l'app admin après validation du paiement
// 1. Récupère un compte disponible en BDD
// 2. L'assigne à la commande
// 3. Envoie les credentials via WhatsApp
// 4. Met à jour tous les statuts
//
// SÉCURITÉ : Ce endpoint requiert un token admin dans le header
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const { sendWhatsAppMessage } = require('./send-message');
const { decryptPassword } = require('../lib/utils');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  
  // Seules les requêtes POST sont acceptées
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ──────────────────────────────────────────────
  // VÉRIFICATION DE L'AUTHENTIFICATION ADMIN
  // L'app mobile envoie le JWT Supabase dans Authorization
  // ──────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  const token = authHeader.replace('Bearer ', '');
  
  // Vérifie le JWT auprès de Supabase
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Token invalide' });
  }

  // ──────────────────────────────────────────────
  // RÉCUPÉRATION DES DONNÉES DE LA REQUÊTE
  // ──────────────────────────────────────────────
  const { orderId } = req.body;
  
  if (!orderId) {
    return res.status(400).json({ error: 'orderId requis' });
  }

  try {
    // ──────────────────────────────────────────
    // ÉTAPE 1 : Récupérer la commande et le client
    // ──────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        clients(whatsapp_phone, display_name),
        services(name, id)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    if (order.status !== 'payment_received' && order.status !== 'validated') {
      return res.status(400).json({ 
        error: `Commande en statut "${order.status}", impossible de livrer` 
      });
    }

    // ──────────────────────────────────────────
    // ÉTAPE 2 : Trouver un compte disponible
    // RÈGLE MÉTIER : FIFO — premier entré, premier sorti
    // ──────────────────────────────────────────
    const { data: availableAccount, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('service_id', order.service_id)
      .eq('status', 'available')
      .order('created_at', { ascending: true }) // FIFO
      .limit(1)
      .single();

    if (accountError || !availableAccount) {
      // STOCK VIDE : Notifier l'admin, ne pas livrer
      console.error(`❌ STOCK VIDE pour le service ${order.services.name}`);
      
      // Envoie un message au client pour l'informer du délai
      await sendWhatsAppMessage(
        order.clients.whatsapp_phone.replace('+', ''),
        `Oups ! 😅 Notre stock pour ${order.services.name} est temporairement épuisé. Notre équipe te contacte dans les prochaines heures pour t'apporter ta solution ⏳ Toutes nos excuses pour ce délai 🙏`
      );

      return res.status(503).json({ 
        error: 'Stock épuisé',
        service: order.services.name 
      });
    }

    // ──────────────────────────────────────────
    // ÉTAPE 3 : Transaction atomique
    // Marque le compte comme attribué ET finalise la commande
    // On utilise une transaction pour éviter les doubles attributions
    // ──────────────────────────────────────────
    
    // Marque le compte comme attribué
    const { error: updateAccountError } = await supabase
      .from('accounts')
      .update({
        status: 'assigned',
        client_id: order.client_id,
        order_id: orderId,
        assigned_at: new Date().toISOString()
      })
      .eq('id', availableAccount.id)
      .eq('status', 'available'); // Double vérification (évite race condition)

    if (updateAccountError) {
      return res.status(409).json({ error: 'Conflit: compte déjà attribué' });
    }

    // Met à jour la commande
    await supabase
      .from('orders')
      .update({
        status: 'delivered',
        account_id: availableAccount.id,
        validated_at: new Date().toISOString(),
        delivered_at: new Date().toISOString()
      })
      .eq('id', orderId);

    // Met à jour la conversation
    await supabase
      .from('conversations')
      .update({ status: 'delivered' })
      .eq('current_order_id', orderId);

    // Met à jour les stats du client
    await supabase
      .from('clients')
      .update({
        total_orders: supabase.raw('total_orders + 1'),
        total_spent: supabase.raw(`total_spent + ${order.amount_fcfa}`)
      })
      .eq('id', order.client_id);

    // ──────────────────────────────────────────
    // ÉTAPE 4 : Déchiffrement du mot de passe
    // Le mot de passe est stocké chiffré en base
    // ──────────────────────────────────────────
    const decryptedPassword = decryptPassword(
      availableAccount.password_enc,
      process.env.ENCRYPTION_KEY
    );

    // ──────────────────────────────────────────
    // ÉTAPE 5 : Envoi des credentials au client via WhatsApp
    // ──────────────────────────────────────────
    const clientPhone = order.clients.whatsapp_phone.replace('+', '');
    const clientName = order.clients.display_name || 'toi';
    const serviceName = order.services.name;

    const deliveryMessage = 
      `Paiement confirmé ✅🎉\n` +
      `Voici ton accès ${serviceName} :\n` +
      `📧 Email : ${availableAccount.email}\n` +
      `🔑 Mot de passe : ${decryptedPassword}\n` +
      `\nBon divertissement avec ML Group ! 🚀\n` +
      `N'hésite pas à revenir, NOVA est toujours là 😊`;

    await sendWhatsAppMessage(clientPhone, deliveryMessage);

    // ──────────────────────────────────────────
    // ÉTAPE 6 : Créer l'entrée dans payments
    // ──────────────────────────────────────────
    await supabase
      .from('payments')
      .update({
        status: 'validated',
        validated_by: user.id,
        validated_at: new Date().toISOString()
      })
      .eq('order_id', orderId);

    console.log(`✅ Compte ${serviceName} livré au client ${clientPhone}`);

    return res.status(200).json({
      success: true,
      message: `Compte ${serviceName} livré avec succès`,
      account: {
        email: availableAccount.email,
        service: serviceName
      }
    });

  } catch (error) {
    console.error('❌ Erreur deliver-account:', error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
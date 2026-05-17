// ============================================================
// api/webhook.js
// Point d'entrée WhatsApp Cloud API
// Gère : vérification webhook (GET) + réception messages (POST)
// ============================================================

const { createClient } = require('@supabase/supabase-js');

// Initialise le client Supabase avec la clé service_role
// IMPORTANT : Ne jamais exposer cette clé côté client mobile
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  
  // ──────────────────────────────────────────────
  // MÉTHODE GET : Vérification du webhook par Meta
  // Meta envoie un GET avec un challenge à renvoyer
  // ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Vérifie que le token correspond à notre secret
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('✅ Webhook vérifié par Meta');
      return res.status(200).send(challenge); // Renvoie le challenge pour validation
    } else {
      console.error('❌ Token de vérification invalide');
      return res.status(403).send('Forbidden');
    }
  }

  // ──────────────────────────────────────────────
  // MÉTHODE POST : Réception d'un nouveau message
  // ──────────────────────────────────────────────
  if (req.method === 'POST') {
    
    // Répond IMMÉDIATEMENT 200 à Meta (obligatoire < 20 secondes)
    // On traite ensuite en asynchrone
    res.status(200).send('EVENT_RECEIVED');

    try {
      const body = req.body;

      // Structure typique d'un message WhatsApp reçu
      // body.entry[0].changes[0].value contient le message
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Ignore les notifications de statut (delivered, read, etc.)
      if (value?.statuses) {
        console.log('📊 Notification de statut reçue (ignorée)');
        return;
      }

      // Récupère le premier message du tableau
      const message = value?.messages?.[0];
      if (!message) {
        console.log('⚠️ Payload reçu sans message');
        return;
      }

      // Récupère le numéro de téléphone de l'expéditeur
      const senderPhone = message.from; // Format: "22670000000" (sans le +)
      const formattedPhone = '+' + senderPhone; // On ajoute le + pour notre BDD

      console.log(`📩 Message reçu de ${formattedPhone}`);

      // ──────────────────────────────────────────
      // ÉTAPE 1 : Identifier ou créer le client
      // ──────────────────────────────────────────
      let client = await getOrCreateClient(supabase, formattedPhone, value.contacts?.[0]?.profile?.name);

      // ──────────────────────────────────────────
      // ÉTAPE 2 : Identifier ou créer la conversation
      // ──────────────────────────────────────────
      let conversation = await getOrCreateConversation(supabase, client.id);

      // Si l'admin a repris la main, le bot ne répond pas
      if (conversation.is_admin_takeover) {
        console.log(`🔕 Admin en contrôle pour ${formattedPhone}, bot silencieux`);
        // On sauvegarde quand même le message entrant
        await appendMessageToConversation(supabase, conversation, message, 'user');
        return;
      }

      // ──────────────────────────────────────────
      // ÉTAPE 3 : Extraire le contenu du message
      // Supporte texte, image (screenshot OM), audio
      // ──────────────────────────────────────────
      let messageContent = null;
      let messageType = message.type;

      if (messageType === 'text') {
        messageContent = message.text.body;
      } else if (messageType === 'image') {
        // Le client a envoyé un screenshot Orange Money
        // On sauvegarde l'ID de l'image pour la récupérer
        messageContent = `[IMAGE_REÇUE: ${message.image.id}]`;
        // Optionnel : récupérer et stocker l'image dans Supabase Storage
      } else if (messageType === 'document') {
        messageContent = `[DOCUMENT_REÇU: ${message.document.id}]`;
      } else {
        // Type non supporté (audio, vidéo, etc.)
        messageContent = `[MESSAGE_TYPE_NON_SUPPORTÉ: ${messageType}]`;
      }

      // ──────────────────────────────────────────
      // ÉTAPE 4 : Sauvegarder le message entrant en BDD
      // ──────────────────────────────────────────
      await appendMessageToConversation(supabase, conversation, {
        type: messageType,
        content: messageContent,
        timestamp: message.timestamp
      }, 'user');

      // Mise à jour du timestamp last_seen du client
      await supabase.from('clients')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', client.id);

      // ──────────────────────────────────────────
      // ÉTAPE 5 : Appel à l'IA (process-ai.js)
      // ──────────────────────────────────────────
      const { generateAIResponse } = require('./process-ai');
      
      const aiResult = await generateAIResponse({
        supabase,
        conversation,
        client,
        newMessage: messageContent,
        messageType
      });

      // ──────────────────────────────────────────
      // ÉTAPE 6 : Envoi de la réponse au client
      // ──────────────────────────────────────────
      if (aiResult.responseText) {
        const { sendWhatsAppMessage } = require('./send-message');
        await sendWhatsAppMessage(senderPhone, aiResult.responseText);

        // Sauvegarde la réponse du bot en BDD
        await appendMessageToConversation(supabase, conversation, {
          type: 'text',
          content: aiResult.responseText,
          timestamp: Math.floor(Date.now() / 1000)
        }, 'bot');
      }

      // ──────────────────────────────────────────
      // ÉTAPE 7 : Traiter les actions système détectées
      // ──────────────────────────────────────────
      if (aiResult.systemAction) {
        await handleSystemAction(supabase, aiResult.systemAction, conversation, client);
      }

    } catch (error) {
      // Log l'erreur mais ne renvoie pas d'erreur à Meta (déjà répondu 200)
      console.error('❌ Erreur traitement webhook:', error);
    }
    
    return;
  }

  // Méthode non supportée
  res.status(405).send('Method Not Allowed');
};

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================

/**
 * Récupère un client existant ou en crée un nouveau
 */
async function getOrCreateClient(supabase, phone, displayName) {
  // Cherche le client par son numéro
  const { data: existing } = await supabase
    .from('clients')
    .select('*')
    .eq('whatsapp_phone', phone)
    .single();

  if (existing) return existing;

  // Crée un nouveau client
  const { data: newClient, error } = await supabase
    .from('clients')
    .insert({ whatsapp_phone: phone, display_name: displayName || null })
    .select()
    .single();

  if (error) throw new Error(`Erreur création client: ${error.message}`);
  console.log(`👤 Nouveau client créé: ${phone}`);
  return newClient;
}

/**
 * Récupère la conversation active ou en crée une nouvelle
 */
async function getOrCreateConversation(supabase, clientId) {
  // Cherche une conversation non terminée
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .not('status', 'eq', 'delivered') // Les conversations finalisées restent mais inactives
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing;

  // Crée une nouvelle conversation
  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      client_id: clientId,
      status: 'new',
      messages: [],
      ai_context: []
    })
    .select()
    .single();

  if (error) throw new Error(`Erreur création conversation: ${error.message}`);
  return newConv;
}

/**
 * Ajoute un message à l'historique de la conversation
 */
async function appendMessageToConversation(supabase, conversation, messageData, role) {
  const newMessage = {
    role,            // 'user' ou 'bot'
    content: messageData.content || messageData.text?.body,
    type: messageData.type || 'text',
    timestamp: messageData.timestamp || Math.floor(Date.now() / 1000)
  };

  // Récupère les messages actuels et ajoute le nouveau
  const currentMessages = conversation.messages || [];
  const updatedMessages = [...currentMessages, newMessage];

  await supabase
    .from('conversations')
    .update({
      messages: updatedMessages,
      last_message_at: new Date().toISOString()
    })
    .eq('id', conversation.id);
}

/**
 * Traite les actions système détectées dans la réponse de l'IA
 */
async function handleSystemAction(supabase, action, conversation, client) {
  console.log(`⚡ Action système: ${action.type}`);

  switch (action.type) {
    case 'NEW_ORDER':
      // Crée une commande en base
      const { data: service } = await supabase
        .from('services')
        .select('id')
        .ilike('name', action.service)
        .single();
      
      if (service) {
        const { data: order } = await supabase
          .from('orders')
          .insert({
            client_id: client.id,
            service_id: service.id,
            duration_months: action.duration || 1,
            amount_fcfa: action.amount,
            status: 'pending'
          })
          .select()
          .single();

        // Lie la commande à la conversation
        await supabase
          .from('conversations')
          .update({ 
            status: 'in_progress',
            current_order_id: order.id 
          })
          .eq('id', conversation.id);
      }
      break;

    case 'NOTIFY_ADMIN':
      // Met le statut de la conversation en "awaiting_payment"
      await supabase
        .from('conversations')
        .update({ status: 'awaiting_payment' })
        .eq('id', conversation.id);
      
      // Met à jour le statut de la commande en cours
      if (conversation.current_order_id) {
        await supabase
          .from('orders')
          .update({ status: 'payment_received' })
          .eq('id', conversation.current_order_id);
      }
      // Note : la notification push vers l'app admin se fait via Supabase Realtime
      // L'app mobile écoute les changements de statut en temps réel
      break;

    case 'ESCALATE_TO_ADMIN':
      // Met le statut en litige
      await supabase
        .from('conversations')
        .update({ status: 'disputed' })
        .eq('id', conversation.id);
      
      if (conversation.current_order_id) {
        await supabase
          .from('orders')
          .update({ status: 'disputed' })
          .eq('id', conversation.current_order_id);
      }
      break;
  }
}
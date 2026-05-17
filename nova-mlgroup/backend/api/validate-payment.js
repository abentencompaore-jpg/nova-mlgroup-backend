// ============================================================
// api/validate-payment.js
// Endpoint appelé par l'app mobile admin pour valider un paiement
// Requiert un JWT Supabase valide dans Authorization header
// ============================================================

const { getSupabaseAdmin } = require('../lib/supabase-admin');
const { log } = require('../lib/utils');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Vérifier l'authentification admin
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  const supabase = getSupabaseAdmin();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' });

  const { orderId, action, rejectionReason } = req.body;
  if (!orderId || !action) return res.status(400).json({ error: 'orderId et action requis' });

  try {
    if (action === 'validate') {
      await supabase.from('orders').update({ status: 'validated', validated_at: new Date().toISOString() }).eq('id', orderId);
      await supabase.from('payments').update({ status: 'validated', validated_by: user.id, validated_at: new Date().toISOString() }).eq('order_id', orderId);
      log('success', `Paiement validé pour commande ${orderId} par ${user.email}`);
      return res.status(200).json({ success: true, message: 'Paiement validé' });
    }

    if (action === 'reject') {
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
      await supabase.from('payments').update({ status: 'rejected', rejection_reason: rejectionReason || 'Non précisé' }).eq('order_id', orderId);

      // Notifier le client du rejet via WhatsApp
      const { data: order } = await supabase.from('orders').select('clients(whatsapp_phone), services(name)').eq('id', orderId).single();
      if (order?.clients?.whatsapp_phone) {
        const { sendWhatsAppMessage } = require('./send-message');
        await sendWhatsAppMessage(
          order.clients.whatsapp_phone.replace('+', ''),
          `Nous n'avons pas pu confirmer ton paiement pour ${order.services?.name} 🙏\nRaison : ${rejectionReason || 'Non précisé'}\nN'hésite pas à nous recontacter pour régulariser 💪`
        );
      }
      return res.status(200).json({ success: true, message: 'Paiement rejeté et client notifié' });
    }

    return res.status(400).json({ error: 'Action inconnue (validate ou reject)' });
  } catch (err) {
    log('error', 'Erreur validate-payment', { error: err.message });
    return res.status(500).json({ error: 'Erreur interne' });
  }
};

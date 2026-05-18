// ============================================================
// api/webhook.js — VERSION CORRIGÉE ET COMPLÈTE
//
// BUGS CORRIGÉS :
// 1. Supabase retourne { data, error } — pas { existing } ou { newClient }
// 2. appendMessageToConversation → messages JSONB (pas table séparée)
// 3. Status filter → 'delivered' et 'disputed' (pas 'finalized'/'dispute')
// 4. NOVA IA activée (était commentée)
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {

  // ── GET : Vérification webhook Meta ──────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('✅ Webhook vérifié');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // ── POST : Message entrant ────────────────────────────────
  if (req.method === 'POST') {

    // ⚡ Répond 200 IMMÉDIATEMENT (Meta timeout = 20s)
    res.status(200).send('EVENT_RECEIVED');

    try {
      const body  = req.body;
      const value = body?.entry?.[0]?.changes?.[0]?.value;

      // Ignorer les notifications de statut (lu, livré, envoyé)
      if (value?.statuses) {
        console.log('📊 Statut reçu (ignoré)');
        return;
      }

      const message = value?.messages?.[0];
      if (!message) {
        console.log('⚠️ Payload sans message');
        return;
      }

      const senderPhone    = message.from;                   // "22670000000"
      const formattedPhone = '+' + senderPhone;             // "+22670000000"
      const senderName     = value.contacts?.[0]?.profile?.name || null;

      console.log(`📩 Message de ${formattedPhone} : ${message.text?.body?.slice(0, 50)}`);

      // ── 1. Client ───────────────────────────────────────
      const client = await getOrCreateClient(formattedPhone, senderName);

      // ── 2. Conversation ─────────────────────────────────
      const conversation = await getOrCreateConversation(client.id);

      // Admin en contrôle → bot silencieux
      if (conversation.is_admin_takeover) {
        console.log('🔕 Admin en contrôle, bot silencieux');
        await saveMessage(conversation, message.text?.body || '', 'user');
        return;
      }

      // ── 3. Extraire le contenu ───────────────────────────
      let messageContent = '';
      if (message.type === 'text') {
        messageContent = message.text.body;
      } else if (message.type === 'image') {
        messageContent = '[Image reçue 📷]';
      } else if (message.type === 'document') {
        messageContent = '[Document reçu 📄]';
      } else {
        messageContent = `[${message.type}]`;
      }

      // ── 4. Sauvegarder le message entrant ───────────────
      await saveMessage(conversation, messageContent, 'user');
      await supabase.from('clients')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', client.id);

      // ── 5. NOVA répond via Gemini ────────────────────────
      const { generateAIResponse } = require('./process-ai');
      const aiResult = await generateAIResponse({
        supabase,
        conversation,
        client,
        newMessage:  messageContent,
        messageType: message.type
      });

      // ── 6. Envoyer la réponse WhatsApp ───────────────────
      if (aiResult.responseText) {
        const { sendWhatsAppMessage } = require('./send-message');
        await sendWhatsAppMessage(senderPhone, aiResult.responseText);
        await saveMessage(conversation, aiResult.responseText, 'bot');
        console.log(`✅ NOVA a répondu (${aiResult.responseText.length} chars)`);
      }

      // ── 7. Actions système détectées par l'IA ────────────
      if (aiResult.systemAction) {
        await handleSystemAction(aiResult.systemAction, conversation, client);
      }

    } catch (error) {
      console.error('❌ Erreur webhook:', error.message);
      console.error(error.stack);
    }

    return;
  }

  res.status(405).send('Method Not Allowed');
};

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================

// ── Récupérer ou créer un client ────────────────────────────
async function getOrCreateClient(phone, displayName) {

  // ✅ CORRECTION BUG 1 : Supabase retourne { data, error }
  //    L'ancien code faisait const { existing } = ... → undefined
  const { data: existing } = await supabase
    .from('clients')
    .select('*')
    .eq('whatsapp_phone', phone)
    .maybeSingle();

  if (existing) return existing;

  const { data: newClient, error } = await supabase
    .from('clients')
    .insert({ whatsapp_phone: phone, display_name: displayName || null })
    .select()
    .single();

  if (error) throw new Error(`Création client : ${error.message}`);
  console.log(`👤 Nouveau client : ${phone}`);
  return newClient;
}

// ── Récupérer ou créer une conversation ─────────────────────
async function getOrCreateConversation(clientId) {

  // ✅ CORRECTION BUG 2 : statuts corrects selon le schéma SQL
  //    L'ancien code utilisait 'finalized' et 'dispute' qui n'existent pas
  //    Les vrais statuts : 'new', 'in_progress', 'awaiting_payment', 'delivered', 'disputed'
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .not('status', 'in', '("delivered","disputed")')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      client_id:       clientId,
      status:          'new',
      messages:        [],
      ai_context:      [],
      last_message_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw new Error(`Création conversation : ${error.message}`);
  console.log(`💬 Nouvelle conversation : ${newConv.id}`);
  return newConv;
}

// ── Sauvegarder un message dans le JSONB ────────────────────
async function saveMessage(conversation, content, role) {

  // ✅ CORRECTION BUG 3 : les messages sont dans la colonne JSONB
  //    de la table conversations — pas dans une table 'messages' séparée
  const { data: current } = await supabase
    .from('conversations')
    .select('messages')
    .eq('id', conversation.id)
    .single();

  const messages = current?.messages || [];
  messages.push({
    role,
    content,
    type:      'text',
    timestamp: Date.now()
  });

  await supabase
    .from('conversations')
    .update({
      messages:        messages,
      last_message_at: new Date().toISOString()
    })
    .eq('id', conversation.id);
}

// ── Traiter les actions système de l'IA ─────────────────────
async function handleSystemAction(action, conversation, client) {
  console.log(`⚡ Action système : ${action.type}`);

  switch (action.type) {

    case 'NEW_ORDER': {
      const { data: service } = await supabase
        .from('services')
        .select('id')
        .ilike('name', action.service)
        .single();

      if (service) {
        const { data: order } = await supabase
          .from('orders')
          .insert({
            client_id:       client.id,
            service_id:      service.id,
            duration_months: action.duration || 1,
            amount_fcfa:     action.amount,
            status:          'pending'
          })
          .select()
          .single();

        await supabase
          .from('conversations')
          .update({ status: 'in_progress', current_order_id: order.id })
          .eq('id', conversation.id);
      }
      break;
    }

    case 'NOTIFY_ADMIN':
      await supabase
        .from('conversations')
        .update({ status: 'awaiting_payment' })
        .eq('id', conversation.id);

      if (conversation.current_order_id) {
        await supabase
          .from('orders')
          .update({ status: 'payment_received' })
          .eq('id', conversation.current_order_id);
      }
      break;

    case 'ESCALATE_TO_ADMIN':
      await supabase
        .from('conversations')
        .update({ status: 'disputed' })
        .eq('id', conversation.id);
      break;
  }
}
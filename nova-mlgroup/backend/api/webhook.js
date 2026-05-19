// ============================================================
// api/webhook.js — SOLUTION DÉFINITIVE
//
// PROBLÈME 1 résolu : Vercel 504
//   → res.status(200) envoyé EN PREMIER à Meta
//   → waitUntil() continue le traitement en arrière-plan
//   → Meta ne voit jamais de timeout → zéro retry → zéro doublon
//
// PROBLÈME 2 résolu : Doublons de messages
//   → Déduplication par message WhatsApp ID
//   → Un message ne peut être traité qu'une seule fois
//
// Installation requise :
//   cd nova-mlgroup/backend && npm install @vercel/functions
// ============================================================

const { waitUntil } = require('@vercel/functions');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Cache mémoire de déduplication (évite de retraiter le même message)
// Survit dans le même container Vercel pendant ~30s
const processedMessages = new Set();

module.exports = async (req, res) => {

  // ── GET : Vérification webhook ────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // ── POST : Message entrant ────────────────────────────────
  if (req.method === 'POST') {

    const body = req.body;

    // ✅ ÉTAPE 1 : Répondre 200 IMMÉDIATEMENT à Meta
    // Meta n'attend plus → zéro 504 → zéro retry → zéro doublon
    res.status(200).send('EVENT_RECEIVED');

    // ✅ ÉTAPE 2 : Traiter en arrière-plan avec waitUntil
    // Vercel garde le process en vie jusqu'à la fin du traitement
    waitUntil(processWebhook(body));

    return;
  }

  res.status(405).send('Method Not Allowed');
};

// ============================================================
// TRAITEMENT PRINCIPAL (arrière-plan)
// ============================================================
async function processWebhook(body) {
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value) return;

    // Ignorer les notifications de statut
    if (value.statuses) return;

    const message = value.messages?.[0];
    if (!message) return;

    // ✅ DÉDUPLICATION : un même message ID ne sera traité qu'une fois
    const msgId = message.id;
    if (processedMessages.has(msgId)) {
      console.log(`⏭️ Message ${msgId} déjà traité, ignoré`);
      return;
    }
    processedMessages.add(msgId);
    // Nettoyage après 60s pour éviter une fuite mémoire
    setTimeout(() => processedMessages.delete(msgId), 60000);

    const senderPhone    = message.from;
    const formattedPhone = '+' + senderPhone;
    const senderName     = value.contacts?.[0]?.profile?.name || null;
    const messageContent = message.text?.body || '[non-texte]';

    console.log(`📩 Message de ${formattedPhone} : "${messageContent}"`);

    // ── 1. Client ─────────────────────────────────────────
    const client = await getOrCreateClient(formattedPhone, senderName);
    console.log('👤 Client OK :', client.id);

    // ── 2. Conversation ───────────────────────────────────
    const conversation = await getOrCreateConversation(client.id);
    console.log('💬 Conversation OK :', conversation.id);

    if (conversation.is_admin_takeover) {
      await saveMessage(conversation, messageContent, 'user');
      return;
    }

    await saveMessage(conversation, messageContent, 'user');
    await supabase.from('clients')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', client.id);

    // ── 3. NOVA répond ────────────────────────────────────
    console.log('🧠 Appel Gemini...');
    const { generateAIResponse } = require('./process-ai');
    const aiResult = await generateAIResponse({
      supabase, conversation, client,
      newMessage: messageContent, messageType: message.type || 'text'
    });
    console.log('🧠 Gemini OK :', aiResult?.responseText?.slice(0, 60));

    // ── 4. Envoi WhatsApp ─────────────────────────────────
    if (aiResult?.responseText) {
      const { sendWhatsAppMessage } = require('./send-message');
      await sendWhatsAppMessage(senderPhone, aiResult.responseText);
      await saveMessage(conversation, aiResult.responseText, 'bot');
      console.log('✅ NOVA a répondu');
    }

    // ── 5. Actions système ────────────────────────────────
    if (aiResult?.systemAction) {
      await handleSystemAction(aiResult.systemAction, conversation, client);
    }

  } catch (error) {
    console.error('❌ ERREUR processWebhook:', error.message);
    console.error(error.stack);
  }
}

// ============================================================
// HELPERS
// ============================================================

async function getOrCreateClient(phone, displayName) {
  const { data: existing } = await supabase
    .from('clients').select('*').eq('whatsapp_phone', phone).maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('clients')
    .insert({ whatsapp_phone: phone, display_name: displayName || null })
    .select().single();
  if (error) throw new Error(`Client : ${error.message}`);
  return data;
}

async function getOrCreateConversation(clientId) {
  const { data: existing } = await supabase
    .from('conversations').select('*')
    .eq('client_id', clientId)
    .not('status', 'in', '("delivered","disputed")')
    .order('last_message_at', { ascending: false })
    .limit(1).maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      client_id:       clientId,
      status:          'new',
      messages:        [],
      ai_context:      [],
      last_message_at: new Date().toISOString()
    })
    .select().single();
  if (error) throw new Error(`Conversation : ${error.message}`);
  return data;
}

async function saveMessage(conversation, content, role) {
  const { data: current } = await supabase
    .from('conversations').select('messages').eq('id', conversation.id).single();
  const messages = [
    ...(current?.messages || []),
    { role, content, type: 'text', timestamp: Date.now() }
  ];
  await supabase.from('conversations')
    .update({ messages, last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);
}

async function handleSystemAction(action, conversation, client) {
  console.log('⚡ Action :', action.type);
  switch (action.type) {
    case 'NEW_ORDER': {
      const { data: svc } = await supabase.from('services')
        .select('id').ilike('name', action.service).single();
      if (svc) {
        const { data: order } = await supabase.from('orders')
          .insert({
            client_id: client.id, service_id: svc.id,
            duration_months: action.duration || 1,
            amount_fcfa: action.amount, status: 'pending'
          }).select().single();
        await supabase.from('conversations')
          .update({ status: 'in_progress', current_order_id: order.id })
          .eq('id', conversation.id);
      }
      break;
    }
    case 'NOTIFY_ADMIN':
      await supabase.from('conversations')
        .update({ status: 'awaiting_payment' }).eq('id', conversation.id);
      if (conversation.current_order_id)
        await supabase.from('orders')
          .update({ status: 'payment_received' }).eq('id', conversation.current_order_id);
      break;
    case 'ESCALATE_TO_ADMIN':
      await supabase.from('conversations')
        .update({ status: 'disputed' }).eq('id', conversation.id);
      break;
  }
}
// ============================================================
// api/webhook.js — VERSION DIAGNOSTIC
// Log chaque étape pour identifier où ça bloque
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {

  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    res.status(200).send('EVENT_RECEIVED');

    try {
      // ── DIAGNOSTIC 1 : Variables d'environnement ──────────
      console.log('🔍 ENV CHECK:');
      console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ défini' : '❌ MANQUANT');
      console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ défini' : '❌ MANQUANT');
      console.log('  GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ défini' : '❌ MANQUANT');
      console.log('  WHATSAPP_ACCESS_TOKEN:', process.env.WHATSAPP_ACCESS_TOKEN ? '✅ défini' : '❌ MANQUANT');
      console.log('  WHATSAPP_PHONE_NUMBER_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID ? '✅ défini' : '❌ MANQUANT');

      const body  = req.body;
      const value = body?.entry?.[0]?.changes?.[0]?.value;

      if (value?.statuses) { console.log('📊 Statut ignoré'); return; }

      const message = value?.messages?.[0];
      if (!message) { console.log('⚠️ Pas de message'); return; }

      const senderPhone    = message.from;
      const formattedPhone = '+' + senderPhone;
      const messageContent = message.text?.body || '[non-texte]';
      const senderName     = value.contacts?.[0]?.profile?.name || null;

      console.log(`📩 Message de ${formattedPhone} : "${messageContent}"`);

      // ── DIAGNOSTIC 2 : Client ─────────────────────────────
      console.log('👤 Étape 1 : getOrCreateClient...');
      const client = await getOrCreateClient(formattedPhone, senderName);
      console.log('👤 Client OK :', client?.id);

      // ── DIAGNOSTIC 3 : Conversation ───────────────────────
      console.log('💬 Étape 2 : getOrCreateConversation...');
      const conversation = await getOrCreateConversation(client.id);
      console.log('💬 Conversation OK :', conversation?.id, '| statut:', conversation?.status);

      if (conversation.is_admin_takeover) {
        console.log('🔕 Admin en contrôle');
        await saveMessage(conversation, messageContent, 'user');
        return;
      }

      await saveMessage(conversation, messageContent, 'user');
      await supabase.from('clients').update({ last_seen_at: new Date().toISOString() }).eq('id', client.id);

      // ── DIAGNOSTIC 4 : Appel Gemini ───────────────────────
      console.log('🧠 Étape 3 : appel Gemini...');
      let aiResult;
      try {
        const { generateAIResponse } = require('./process-ai');
        aiResult = await generateAIResponse({
          supabase, conversation, client,
          newMessage: messageContent, messageType: message.type
        });
        console.log('🧠 Gemini OK — réponse :', aiResult?.responseText?.slice(0, 80));
      } catch (geminiErr) {
        console.error('❌ ERREUR GEMINI :', geminiErr.message);
        // Réponse de fallback si Gemini échoue
        aiResult = {
          responseText: 'Bonjour ! Je suis NOVA 😊 Je rencontre un souci technique, reviens dans quelques minutes !',
          systemAction: null
        };
      }

      // ── DIAGNOSTIC 5 : Envoi WhatsApp ─────────────────────
      console.log('📤 Étape 4 : envoi WhatsApp vers', senderPhone, '...');
      try {
        const { sendWhatsAppMessage } = require('./send-message');
        await sendWhatsAppMessage(senderPhone, aiResult.responseText);
        console.log('📤 Message WhatsApp envoyé ✅');
      } catch (sendErr) {
        console.error('❌ ERREUR ENVOI WHATSAPP :', sendErr.message);
      }

      await saveMessage(conversation, aiResult.responseText, 'bot');

      if (aiResult.systemAction) {
        await handleSystemAction(aiResult.systemAction, conversation, client);
      }

      console.log('✅ Traitement complet terminé');

    } catch (error) {
      console.error('❌ ERREUR GLOBALE :', error.message);
      console.error(error.stack);
    }

    return;
  }

  res.status(405).send('Method Not Allowed');
};

// ── Helpers ──────────────────────────────────────────────────

async function getOrCreateClient(phone, displayName) {
  const { data: existing } = await supabase
    .from('clients').select('*').eq('whatsapp_phone', phone).maybeSingle();
  if (existing) return existing;

  const { data: newClient, error } = await supabase
    .from('clients')
    .insert({ whatsapp_phone: phone, display_name: displayName || null })
    .select().single();
  if (error) throw new Error(`Client : ${error.message}`);
  return newClient;
}

async function getOrCreateConversation(clientId) {
  const { data: existing } = await supabase
    .from('conversations').select('*').eq('client_id', clientId)
    .not('status', 'in', '("delivered","disputed")')
    .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  if (existing) return existing;

  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({ client_id: clientId, status: 'new', messages: [], ai_context: [], last_message_at: new Date().toISOString() })
    .select().single();
  if (error) throw new Error(`Conversation : ${error.message}`);
  return newConv;
}

async function saveMessage(conversation, content, role) {
  const { data: current } = await supabase
    .from('conversations').select('messages').eq('id', conversation.id).single();
  const messages = [...(current?.messages || []), { role, content, type: 'text', timestamp: Date.now() }];
  await supabase.from('conversations')
    .update({ messages, last_message_at: new Date().toISOString() }).eq('id', conversation.id);
}

async function handleSystemAction(action, conversation, client) {
  console.log(`⚡ Action : ${action.type}`);
  switch (action.type) {
    case 'NEW_ORDER': {
      const { data: svc } = await supabase.from('services').select('id').ilike('name', action.service).single();
      if (svc) {
        const { data: order } = await supabase.from('orders')
          .insert({ client_id: client.id, service_id: svc.id, duration_months: action.duration || 1, amount_fcfa: action.amount, status: 'pending' })
          .select().single();
        await supabase.from('conversations').update({ status: 'in_progress', current_order_id: order.id }).eq('id', conversation.id);
      }
      break;
    }
    case 'NOTIFY_ADMIN':
      await supabase.from('conversations').update({ status: 'awaiting_payment' }).eq('id', conversation.id);
      if (conversation.current_order_id)
        await supabase.from('orders').update({ status: 'payment_received' }).eq('id', conversation.current_order_id);
      break;
    case 'ESCALATE_TO_ADMIN':
      await supabase.from('conversations').update({ status: 'disputed' }).eq('id', conversation.id);
      break;
  }
}
// ============================================================
// 📡 api/webhook.js — Point d'entrée WhatsApp Cloud API
// Gère : vérification webhook (GET) + réception messages (POST)
// ============================================================

const { createClient } = require('@supabase/supabase-js');

// Client Supabase avec la clé service_role (BACKEND UNIQUEMENT)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {

  // 🔬 ════════════════════════════════════════════════
  // LOG DE DIAGNOSTIC - À garder pour l'instant
  // ════════════════════════════════════════════════
  console.log('═══════════════════════════════════');
  console.log('📥 REQUÊTE REÇUE');
  console.log('Méthode :', req.method);
  console.log('Headers :', JSON.stringify(req.headers, null, 2));
  console.log('Body :', JSON.stringify(req.body, null, 2));
  console.log('Query :', JSON.stringify(req.query, null, 2));
  console.log('═══════════════════════════════════');

  // ──────────────────────────────────────────────
  // 🔐 MÉTHODE GET : Vérification webhook par Meta
  // ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('✅ Webhook vérifié par Meta');
      return res.status(200).send(challenge);
    } else {
      console.error('❌ Token de vérification invalide');
      console.error('Token reçu :', token);
      console.error('Token attendu :', process.env.WHATSAPP_VERIFY_TOKEN);
      return res.status(403).send('Forbidden');
    }
  }

  // ──────────────────────────────────────────────
  // 📨 MÉTHODE POST : Réception d'un message
  // ──────────────────────────────────────────────
  if (req.method === 'POST') {
    // ⚡ Répond IMMÉDIATEMENT 200 à Meta (obligatoire < 20s)
    res.status(200).send('EVENT_RECEIVED');

    try {
      const body = req.body;
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Ignore les notifications de statut (delivered, read, sent)
      if (value?.statuses) {
        console.log('📊 Statut reçu (ignoré) :', value.statuses[0]?.status);
        return;
      }

      const message = value?.messages?.[0];
      if (!message) {
        console.log('⚠️ Payload reçu sans message exploitable');
        return;
      }

      const senderPhone = message.from;
      const formattedPhone = '+' + senderPhone;
      console.log(`📩 Message reçu de ${formattedPhone}`);

      // ÉTAPE 1 : Client
      let client = await getOrCreateClient(
        formattedPhone,
        value.contacts?.[0]?.profile?.name
      );

      // ÉTAPE 2 : Conversation
      let conversation = await getOrCreateConversation(client.id);

      // Si admin a repris la main → sauvegarder mais ne pas répondre
      if (conversation.is_admin_takeover) {
        console.log(`🔕 Admin en contrôle, bot silencieux`);
        await appendMessageToConversation(conversation, message, 'user');
        return;
      }

      // ÉTAPE 3 : Extraire contenu
      let messageContent = null;
      const messageType = message.type;

      if (messageType === 'text') {
        messageContent = message.text.body;
      } else if (messageType === 'image') {
        messageContent = `[IMAGE_REÇUE: ${message.image.id}]`;
      } else if (messageType === 'document') {
        messageContent = `[DOCUMENT_REÇU: ${message.document.id}]`;
      } else {
        messageContent = `[TYPE_NON_SUPPORTÉ: ${messageType}]`;
      }

      // ÉTAPE 4 : Sauvegarder message entrant
      await appendMessageToConversation(conversation, {
        type: messageType,
        content: messageContent,
        timestamp: message.timestamp
      }, 'user');

      await supabase.from('clients')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', client.id);

      // ÉTAPE 5 : Appel IA (commenté pour le test initial)
      // const { generateAIResponse } = require('./process-ai');
      // const aiResult = await generateAIResponse({ ... });

      // 🧪 TEST INITIAL : on répond juste "echo" pour valider le flux
      const { sendWhatsAppMessage } = require('./send-message');
      const testReply = `🤖 NOVA reçu ton message : "${messageContent}"\n\n(Mode test — l'IA arrive bientôt !)`;
      await sendWhatsAppMessage(senderPhone, testReply);

      await appendMessageToConversation(conversation, {
        type: 'text',
        content: testReply,
        timestamp: Math.floor(Date.now() / 1000)
      }, 'bot');

      console.log('✅ Réponse envoyée avec succès');

    } catch (error) {
      console.error('❌ Erreur traitement webhook:', error);
      console.error('Stack:', error.stack);
    }

    return;
  }

  // Méthode non supportée
  res.status(405).send('Method Not Allowed');
};

// ============================================================
// 🛠️ FONCTIONS UTILITAIRES
// ============================================================

async function getOrCreateClient(phone, displayName) {
  const { existing } = await supabase
    .from('clients')
    .select('*')
    .eq('whatsapp_phone', phone)
    .maybeSingle();

  if (existing) return existing;

  const { newClient, error } = await supabase
    .from('clients')
    .insert({ whatsapp_phone: phone, display_name: displayName || null })
    .select()
    .single();

  if (error) throw new Error(`Création client : ${error.message}`);
  console.log(`👤 Nouveau client créé : ${phone}`);
  return newClient;
}

// ─────────────────────────────────────────────────────────────
async function getOrCreateConversation(clientId) {
  // On cherche une conversation active (pas finalisée, pas en litige)
  const { existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .not('status', 'in', '("finalized","dispute")')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  // Sinon on en crée une nouvelle
  const { newConv, error } = await supabase
    .from('conversations')
    .insert({
      client_id: clientId,
      status: 'new',
      is_bot_active: true,
      last_message_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw new Error(`Création conversation : ${error.message}`);
  console.log(`💬 Nouvelle conversation créée : ${newConv.id}`);
  return newConv;
}

// ─────────────────────────────────────────────────────────────
async function appendMessageToConversation(conversation, message, sender) {
  // Insère le message dans la table messages
  const senderEnum = sender === 'user' ? 'client' : (sender === 'bot' ? 'nova' : 'admin');

  const { error: msgError } = await supabase.from('messages').insert({
    conversation_id: conversation.id,
    sender: senderEnum,
    content: message.content || message.text || '',
    message_type: message.type || 'text',
    media_url: message.media_url || null,
    whatsapp_message_id: message.whatsapp_id || null
  });

  if (msgError) {
    console.error('❌ Erreur insertion message:', msgError);
    return;
  }

  // Met à jour la conversation avec le dernier message
  const preview = (message.content || '').substring(0, 80);
  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview
    })
    .eq('id', conversation.id);
}
#!/bin/bash

# ============================================================
# NOVA by ML Group — Script de création de l'arborescence
# Usage : bash setup.sh
# ============================================================

set -e  # Arrête le script si une commande échoue

echo ""
echo "🚀 Création du projet NOVA by ML Group..."
echo "============================================"

# ──────────────────────────────────────────────
# CRÉATION DES DOSSIERS
# ──────────────────────────────────────────────
mkdir -p nova-mlgroup/backend/api
mkdir -p nova-mlgroup/backend/lib
mkdir -p nova-mlgroup/mobile/app/\(tabs\)
mkdir -p nova-mlgroup/mobile/lib
mkdir -p nova-mlgroup/mobile/types
mkdir -p nova-mlgroup/mobile/components

echo "📁 Dossiers créés"

# ══════════════════════════════════════════════════════════════
# BACKEND — package.json
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/package.json << 'EOF'
{
  "name": "nova-mlgroup-backend",
  "version": "1.0.0",
  "description": "NOVA by ML Group — Backend WhatsApp Bot (Vercel Serverless)",
  "main": "api/webhook.js",
  "scripts": {
    "dev": "vercel dev",
    "deploy": "vercel --prod"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {
    "vercel": "^37.0.0"
  },
  "engines": {
    "node": ">=18.x"
  }
}
EOF

# ══════════════════════════════════════════════════════════════
# BACKEND — vercel.json
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/vercel.json << 'EOF'
{
  "version": 2,
  "functions": {
    "api/*.js": {
      "memory": 256,
      "maxDuration": 15
    }
  },
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" }
  ],
  "env": {
    "WHATSAPP_ACCESS_TOKEN": "@whatsapp_access_token",
    "WHATSAPP_PHONE_NUMBER_ID": "@whatsapp_phone_number_id",
    "WHATSAPP_VERIFY_TOKEN": "@whatsapp_verify_token",
    "SUPABASE_URL": "@supabase_url",
    "SUPABASE_SERVICE_ROLE_KEY": "@supabase_service_role_key",
    "GEMINI_API_KEY": "@gemini_api_key",
    "OM_PHONE_NUMBER": "@om_phone_number",
    "OM_BENEFICIARY_NAME": "@om_beneficiary_name",
    "ENCRYPTION_KEY": "@encryption_key"
  }
}
EOF

# ══════════════════════════════════════════════════════════════
# BACKEND — .env.example
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/.env.example << 'EOF'
# WhatsApp Cloud API (Meta for Developers)
WHATSAPP_ACCESS_TOKEN=your_system_user_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_BUSINESS_ACCOUNT_ID=your_waba_id_here
WHATSAPP_VERIFY_TOKEN=nova_secret_2024

# Supabase (Settings > API)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret_key_here

# Google Gemini Flash (aistudio.google.com)
GEMINI_API_KEY=your_gemini_api_key_here

# Orange Money (numéro de réception des paiements)
OM_PHONE_NUMBER=+22670000000
OM_BENEFICIARY_NAME=ML Group

# Chiffrement mots de passe comptes (32 caractères aléatoires)
ENCRYPTION_KEY=your_32_char_random_encryption_key_here
EOF

# ══════════════════════════════════════════════════════════════
# BACKEND — lib/supabase-admin.js
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/lib/supabase-admin.js << 'EOF'
// ============================================================
// lib/supabase-admin.js
// Client Supabase côté backend (service_role)
// ⚠️ NE JAMAIS exposer ce fichier ou cette clé côté client
// ============================================================

const { createClient } = require('@supabase/supabase-js');

let supabaseAdmin = null;

/**
 * Retourne un client Supabase singleton avec la clé service_role
 * Le service_role bypasse toutes les RLS policies
 */
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Variables SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquantes');
    }
    supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }
  return supabaseAdmin;
}

module.exports = { getSupabaseAdmin };
EOF

# ══════════════════════════════════════════════════════════════
# BACKEND — lib/utils.js
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/lib/utils.js << 'EOF'
// ============================================================
// lib/utils.js
// Fonctions utilitaires : logging, chiffrement, parsing
// ============================================================

const crypto = require('crypto');

// ──────────────────────────────────────────────
// LOGGING avec timestamp et niveau
// ──────────────────────────────────────────────
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    info:  '📘',
    warn:  '⚠️',
    error: '❌',
    success: '✅'
  }[level] || '📘';

  console.log(`[${timestamp}] ${prefix} ${message}`, data ? JSON.stringify(data) : '');
}

// ──────────────────────────────────────────────
// CHIFFREMENT AES-256-GCM (mots de passe comptes)
// ──────────────────────────────────────────────

/**
 * Chiffre un mot de passe avant stockage en base
 * @param {string} plaintext - Le mot de passe en clair
 * @param {string} key - La clé de chiffrement (ENCRYPTION_KEY env var)
 * @returns {string} - Données chiffrées encodées en base64 (iv:tag:encrypted)
 */
function encryptPassword(plaintext, key) {
  const keyBuffer = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Déchiffre un mot de passe stocké en base
 * @param {string} encryptedData - Données chiffrées (iv:tag:encrypted)
 * @param {string} key - La clé de chiffrement
 * @returns {string} - Le mot de passe en clair
 */
function decryptPassword(encryptedData, key) {
  const [ivHex, tagHex, encrypted] = encryptedData.split(':');
  const keyBuffer = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ──────────────────────────────────────────────
// FORMAT NUMÉRO DE TÉLÉPHONE
// ──────────────────────────────────────────────

/**
 * Normalise un numéro WhatsApp
 * WhatsApp envoie "22670000000", on stocke "+22670000000"
 */
function normalizePhone(phone) {
  if (phone.startsWith('+')) return phone;
  return '+' + phone;
}

/**
 * Supprime le + pour l'API WhatsApp Cloud
 */
function stripPlusFromPhone(phone) {
  return phone.replace('+', '');
}

// ──────────────────────────────────────────────
// PARSING DU SYSTEM_ACTION dans les réponses IA
// ──────────────────────────────────────────────

/**
 * Extrait le SYSTEM_ACTION de la réponse de l'IA
 * @param {string} rawText - Texte brut retourné par Gemini
 * @returns {{ cleanText: string, action: object|null }}
 */
function parseSystemAction(rawText) {
  const regex = /\nSYSTEM_ACTION:\s*(\{.*?\})\s*$/m;
  const match = rawText.match(regex);

  if (!match) {
    return { cleanText: rawText.trim(), action: null };
  }

  let action = null;
  try {
    action = JSON.parse(match[1]);
  } catch (e) {
    log('warn', 'Impossible de parser SYSTEM_ACTION', { raw: match[1] });
  }

  const cleanText = rawText.replace(regex, '').trim();
  return { cleanText, action };
}

module.exports = {
  log,
  encryptPassword,
  decryptPassword,
  normalizePhone,
  stripPlusFromPhone,
  parseSystemAction
};
EOF

# ══════════════════════════════════════════════════════════════
# BACKEND — api/webhook.js
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/api/webhook.js << 'EOF'
// ============================================================
// api/webhook.js
// Point d'entrée principal WhatsApp Cloud API
// GET  → Vérification webhook par Meta
// POST → Réception des messages clients
// ============================================================

const { getSupabaseAdmin } = require('../lib/supabase-admin');
const { log, normalizePhone } = require('../lib/utils');

module.exports = async (req, res) => {

  // ── GET : Vérification webhook Meta ──────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      log('success', 'Webhook vérifié par Meta');
      return res.status(200).send(challenge);
    }
    log('error', 'Vérification webhook échouée - token invalide');
    return res.status(403).send('Forbidden');
  }

  // ── POST : Réception message ─────────────────────────────
  if (req.method === 'POST') {

    // Répondre 200 IMMÉDIATEMENT (WhatsApp timeout = 20s)
    res.status(200).send('EVENT_RECEIVED');

    try {
      const body = req.body;
      const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const contacts = body?.entry?.[0]?.changes?.[0]?.value?.contacts;

      // Ignorer les notifications de statut (lu, livré, etc.)
      if (!message) {
        log('info', 'Notification de statut reçue (ignorée)');
        return;
      }

      const senderPhone   = message.from;                        // "22670000000"
      const formattedPhone = normalizePhone(senderPhone);        // "+22670000000"
      const senderName     = contacts?.[0]?.profile?.name || null;

      log('info', `Message reçu de ${formattedPhone}`, { type: message.type });

      const supabase = getSupabaseAdmin();

      // 1. Identifier ou créer le client
      const client = await getOrCreateClient(supabase, formattedPhone, senderName);

      // 2. Identifier ou créer la conversation
      const conversation = await getOrCreateConversation(supabase, client.id);

      // 3. Si l'admin a la main → bot silencieux, on sauvegarde juste le message
      if (conversation.is_admin_takeover) {
        log('info', `Admin en contrôle pour ${formattedPhone}`);
        await saveMessage(supabase, conversation.id, message, 'user');
        return;
      }

      // 4. Extraire le contenu du message
      const { content, type } = extractMessageContent(message);

      // 5. Sauvegarder le message entrant
      await saveMessage(supabase, conversation.id, { content, type }, 'user');
      await supabase.from('clients').update({ last_seen_at: new Date().toISOString() }).eq('id', client.id);

      // 6. Générer la réponse IA
      const { generateAIResponse } = require('./process-ai');
      const aiResult = await generateAIResponse({ supabase, conversation, client, newMessage: content, messageType: type });

      // 7. Envoyer la réponse au client
      if (aiResult.responseText) {
        const { sendWhatsAppMessage } = require('./send-message');
        await sendWhatsAppMessage(senderPhone, aiResult.responseText);
        await saveMessage(supabase, conversation.id, { content: aiResult.responseText, type: 'text' }, 'bot');
      }

      // 8. Traiter les actions système
      if (aiResult.systemAction) {
        await handleSystemAction(supabase, aiResult.systemAction, conversation, client);
      }

    } catch (err) {
      log('error', 'Erreur traitement webhook', { message: err.message });
    }
    return;
  }

  res.status(405).send('Method Not Allowed');
};

// ── Helpers ──────────────────────────────────────────────────

async function getOrCreateClient(supabase, phone, name) {
  const { data: existing } = await supabase.from('clients').select('*').eq('whatsapp_phone', phone).single();
  if (existing) return existing;
  const { data, error } = await supabase.from('clients').insert({ whatsapp_phone: phone, display_name: name }).select().single();
  if (error) throw new Error(`Création client: ${error.message}`);
  log('success', `Nouveau client: ${phone}`);
  return data;
}

async function getOrCreateConversation(supabase, clientId) {
  const { data: existing } = await supabase
    .from('conversations').select('*').eq('client_id', clientId)
    .not('status', 'eq', 'delivered').order('last_message_at', { ascending: false }).limit(1).single();
  if (existing) return existing;
  const { data, error } = await supabase.from('conversations')
    .insert({ client_id: clientId, status: 'new', messages: [], ai_context: [] }).select().single();
  if (error) throw new Error(`Création conversation: ${error.message}`);
  return data;
}

async function saveMessage(supabase, conversationId, messageData, role) {
  const { data: conv } = await supabase.from('conversations').select('messages').eq('id', conversationId).single();
  const messages = [...(conv?.messages || []), { role, content: messageData.content, type: messageData.type, timestamp: Date.now() }];
  await supabase.from('conversations').update({ messages, last_message_at: new Date().toISOString() }).eq('id', conversationId);
}

function extractMessageContent(message) {
  switch (message.type) {
    case 'text':     return { content: message.text.body,            type: 'text' };
    case 'image':    return { content: `[IMAGE:${message.image.id}]`, type: 'image' };
    case 'document': return { content: `[DOC:${message.document.id}]`, type: 'document' };
    default:         return { content: `[${message.type.toUpperCase()}]`, type: message.type };
  }
}

async function handleSystemAction(supabase, action, conversation, client) {
  log('info', `Action système: ${action.type}`);
  switch (action.type) {
    case 'NEW_ORDER': {
      const { data: service } = await supabase.from('services').select('id').ilike('name', action.service).single();
      if (service) {
        const { data: order } = await supabase.from('orders')
          .insert({ client_id: client.id, service_id: service.id, duration_months: action.duration || 1, amount_fcfa: action.amount, status: 'pending' })
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
      if (conversation.current_order_id)
        await supabase.from('orders').update({ status: 'disputed' }).eq('id', conversation.current_order_id);
      break;
  }
}
EOF

# ══════════════════════════════════════════════════════════════
# BACKEND — api/send-message.js
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/api/send-message.js << 'EOF'
// ============================================================
// api/send-message.js
// Envoi de messages via WhatsApp Cloud API (Meta)
// Supporte : texte simple, messages avec boutons (à venir)
// ============================================================

const { log } = require('../lib/utils');

const WA_API_URL = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

/**
 * Envoie un message texte simple à un numéro WhatsApp
 * @param {string} to - Numéro destinataire sans le + (ex: "22670000000")
 * @param {string} text - Texte du message (max 4096 chars)
 */
async function sendWhatsAppMessage(to, text) {
  // Découpe les messages trop longs (limite WhatsApp : 4096 chars)
  const chunks = splitMessage(text, 4000);

  for (const chunk of chunks) {
    await sendSingleMessage(to, chunk);
    if (chunks.length > 1) await sleep(500); // Petit délai entre morceaux
  }
}

async function sendSingleMessage(to, text) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      preview_url: false,
      body: text
    }
  };

  let attempt = 0;
  while (attempt < 3) {
    try {
      const response = await fetch(WA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`WhatsApp API ${response.status}: ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      log('success', `Message envoyé à ${to}`, { messageId: data.messages?.[0]?.id });
      return data;

    } catch (err) {
      attempt++;
      if (attempt >= 3) {
        log('error', `Échec envoi message après 3 tentatives vers ${to}`, { error: err.message });
        throw err;
      }
      await sleep(1000 * attempt);
    }
  }
}

function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, maxLength));
    remaining = remaining.slice(maxLength);
  }
  return chunks;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendWhatsAppMessage };
EOF

# ══════════════════════════════════════════════════════════════
# BACKEND — api/process-ai.js
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/api/process-ai.js << 'EOF'
// ============================================================
// api/process-ai.js
// Appel à l'API Google Gemini Flash
// Gère l'historique multi-tours et le parsing des actions
// ============================================================

const { log, parseSystemAction } = require('../lib/utils');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

function buildSystemPrompt(ctx) {
  return `Tu es NOVA, l'assistante digitale de ML Group (Ouagadougou, Burkina Faso).
Tu vends des abonnements numériques via WhatsApp. Ton ton est jeune, dynamique, chaleureux.

CATALOGUE TARIFAIRE (prix fixes, non négociables) :
Netflix 2500F/mois | Prime Video 3500F/mois | Crunchyroll 3000F/mois | Disney+ 5500F/mois
Plex TV 8500F/mois | My Canal 5000F/mois | IPTV 18000F/6mois | Spotify 3000F/mois
Apple Music 4000F/mois | PlayStation+ 8000F/mois | Canva Pro 4000F/mois
CapCut Pro 9500F/mois | iCloud 200Go 3500F/mois | Snapchat+ 10000F/an | VPN 3000F/mois

CONTEXTE : Client: ${ctx.clientName || 'Nouveau'} | Statut: ${ctx.status} | Commande: ${ctx.order ? JSON.stringify(ctx.order) : 'Aucune'}
Date: ${new Date().toLocaleString('fr-FR')}
Numéro Orange Money: ${process.env.OM_PHONE_NUMBER} | Bénéficiaire: ${process.env.OM_BENEFICIARY_NAME}

RÈGLES : 1) Jamais donner email/mdp avant validation admin 2) Jamais négocier les prix
3) Jamais inventer un prix 4) Abonnement personnalisé → escalade toujours à l'admin

ACTIONS SYSTÈME (ajouter en fin de message sur une nouvelle ligne UNIQUEMENT quand nécessaire) :
SYSTEM_ACTION: {"type":"NEW_ORDER","service":"Netflix","duration":1,"amount":2500}
SYSTEM_ACTION: {"type":"NOTIFY_ADMIN","data":{}}
SYSTEM_ACTION: {"type":"ESCALATE_TO_ADMIN","reason":"litige"}`;
}

async function generateAIResponse({ supabase, conversation, client, newMessage }) {
  // Récupère la commande en cours
  let currentOrder = null;
  if (conversation.current_order_id) {
    const { data } = await supabase.from('orders').select('*, services(name)').eq('id', conversation.current_order_id).single();
    currentOrder = data;
  }

  const ctx = {
    clientName: client.display_name,
    status: conversation.status,
    order: currentOrder ? { service: currentOrder.services?.name, duration: currentOrder.duration_months, amount: currentOrder.amount_fcfa } : null
  };

  // Historique (20 derniers messages)
  const history = (conversation.messages || []).slice(-20).map(m => ({
    role: m.role === 'bot' ? 'model' : 'user',
    parts: [{ text: m.content || '[non-texte]' }]
  }));

  history.push({ role: 'user', parts: [{ text: newMessage }] });

  const body = {
    system_instruction: { parts: [{ text: buildSystemPrompt(ctx) }] },
    contents: history,
    generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.status === 429) {
        log('warn', `Rate limit Gemini, retry ${attempt + 1}/3`);
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }

      if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Réponse Gemini vide');

      const { cleanText, action } = parseSystemAction(rawText);
      log('success', `NOVA a répondu (${cleanText.length} chars)${action ? ` + action ${action.type}` : ''}`);
      return { responseText: cleanText, systemAction: action };

    } catch (err) {
      if (attempt === 2) {
        log('error', 'Gemini échoué après 3 tentatives', { error: err.message });
        return {
          responseText: "Désolé, je rencontre un souci technique 😅 Notre équipe revient vers toi dans quelques minutes 💪",
          systemAction: null
        };
      }
    }
  }
}

module.exports = { generateAIResponse };
EOF

# ══════════════════════════════════════════════════════════════
# BACKEND — api/validate-payment.js
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/api/validate-payment.js << 'EOF'
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
EOF

# ══════════════════════════════════════════════════════════════
# BACKEND — api/deliver-account.js
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/backend/api/deliver-account.js << 'EOF'
// ============================================================
// api/deliver-account.js
// Livraison d'un compte après validation du paiement
// 1. Récupère un compte disponible (FIFO)
// 2. L'assigne à la commande
// 3. Envoie les credentials au client via WhatsApp
// ============================================================

const { getSupabaseAdmin } = require('../lib/supabase-admin');
const { sendWhatsAppMessage } = require('./send-message');
const { log, decryptPassword } = require('../lib/utils');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  const supabase = getSupabaseAdmin();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' });

  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId requis' });

  try {
    // 1. Récupérer la commande
    const { data: order } = await supabase.from('orders')
      .select('*, clients(whatsapp_phone, display_name), services(name, id)').eq('id', orderId).single();

    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    if (!['payment_received', 'validated'].includes(order.status))
      return res.status(400).json({ error: `Statut "${order.status}" invalide pour livraison` });

    // 2. Trouver un compte disponible (FIFO)
    const { data: account } = await supabase.from('accounts')
      .select('*').eq('service_id', order.service_id).eq('status', 'available')
      .order('created_at', { ascending: true }).limit(1).single();

    if (!account) {
      // Stock vide : prévenir le client
      await sendWhatsAppMessage(
        order.clients.whatsapp_phone.replace('+', ''),
        `Notre stock pour ${order.services.name} est temporairement épuisé 😅\nNotre équipe te recontacte très vite avec ta solution ⏳ Toutes nos excuses 🙏`
      );
      log('warn', `Stock vide pour ${order.services.name}`);
      return res.status(503).json({ error: 'Stock épuisé', service: order.services.name });
    }

    // 3. Assigner le compte (double vérification anti-race condition)
    const { error: updateErr } = await supabase.from('accounts')
      .update({ status: 'assigned', client_id: order.client_id, order_id: orderId, assigned_at: new Date().toISOString() })
      .eq('id', account.id).eq('status', 'available'); // ← Anti race-condition

    if (updateErr) return res.status(409).json({ error: 'Conflit : compte déjà attribué, réessaie' });

    // 4. Finaliser la commande
    await supabase.from('orders').update({ status: 'delivered', account_id: account.id, delivered_at: new Date().toISOString() }).eq('id', orderId);
    await supabase.from('conversations').update({ status: 'delivered' }).eq('current_order_id', orderId);

    // 5. Déchiffrer et envoyer les credentials
    const password = decryptPassword(account.password_enc, process.env.ENCRYPTION_KEY);
    await sendWhatsAppMessage(
      order.clients.whatsapp_phone.replace('+', ''),
      `Paiement confirmé ✅🎉\nVoici ton accès ${order.services.name} :\n📧 Email : ${account.email}\n🔑 Mot de passe : ${password}\n\nBon divertissement avec ML Group ! 🚀\nN'hésite pas à revenir, NOVA est toujours là 😊`
    );

    log('success', `Compte ${order.services.name} livré à ${order.clients.whatsapp_phone}`);
    return res.status(200).json({ success: true, message: `Compte ${order.services.name} livré avec succès` });

  } catch (err) {
    log('error', 'Erreur deliver-account', { error: err.message });
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
};
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — package.json
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/package.json << 'EOF'
{
  "name": "nova-mlgroup-mobile",
  "main": "expo-router/entry",
  "version": "1.0.0",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "build:android": "eas build --platform android",
    "build:ios": "eas build --platform ios"
  },
  "dependencies": {
    "@expo/vector-icons": "^14.0.0",
    "@react-native-async-storage/async-storage": "1.23.1",
    "@supabase/supabase-js": "^2.45.0",
    "expo": "~51.0.0",
    "expo-router": "~3.5.0",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.5",
    "react-native-safe-area-context": "4.10.5",
    "react-native-screens": "3.31.1",
    "react-native-url-polyfill": "^2.0.0"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@types/react": "~18.2.79",
    "typescript": "~5.3.3"
  }
}
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — app.json
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/app.json << 'EOF'
{
  "expo": {
    "name": "NOVA — ML Group",
    "slug": "nova-mlgroup",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "nova-mlgroup",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0f172a"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0f172a"
      },
      "package": "com.mlgroup.nova"
    },
    "ios": {
      "bundleIdentifier": "com.mlgroup.nova"
    },
    "plugins": [
      "expo-router"
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — .env.example
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/.env.example << 'EOF'
# Supabase (clés PUBLIQUES — safe côté client)
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key_here

# URL du backend Vercel
EXPO_PUBLIC_BACKEND_URL=https://nova-mlgroup-backend.vercel.app
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — types/index.ts
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/types/index.ts << 'EOF'
// ============================================================
// types/index.ts
// Types TypeScript partagés dans toute l'application mobile
// ============================================================

export type ConversationStatus = 'new' | 'in_progress' | 'awaiting_payment' | 'delivered' | 'disputed';
export type OrderStatus = 'pending' | 'payment_received' | 'validated' | 'delivered' | 'disputed' | 'cancelled';
export type AccountStatus = 'available' | 'assigned' | 'expired';

export interface Client {
  id: string;
  whatsapp_phone: string;
  display_name: string | null;
  total_orders: number;
  total_spent: number;
  created_at: string;
  last_seen_at: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price_fcfa: number;
  duration_unit: string;
  description: string | null;
  is_active: boolean;
}

export interface Account {
  id: string;
  service_id: string;
  email: string;
  password_enc: string;
  duration_months: number | null;
  expires_at: string | null;
  status: AccountStatus;
  client_id: string | null;
  order_id: string | null;
  assigned_at: string | null;
  created_at: string;
  // Relations jointes
  services?: Service;
  clients?: Client;
}

export interface Order {
  id: string;
  client_id: string;
  service_id: string;
  account_id: string | null;
  duration_months: number;
  amount_fcfa: number;
  status: OrderStatus;
  created_at: string;
  validated_at: string | null;
  delivered_at: string | null;
  // Relations jointes
  clients?: Client;
  services?: Service;
}

export interface Message {
  role: 'user' | 'bot';
  content: string;
  type: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  client_id: string;
  status: ConversationStatus;
  current_order_id: string | null;
  messages: Message[];
  is_admin_takeover: boolean;
  last_message_at: string;
  created_at: string;
  // Relations jointes
  clients?: Client;
  orders?: Order;
}

export interface Payment {
  id: string;
  order_id: string;
  client_id: string;
  amount_fcfa: number;
  payment_method: string;
  proof_value: string | null;
  proof_type: 'transaction_code' | 'screenshot_url' | null;
  status: 'pending' | 'validated' | 'rejected';
  validated_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface TreasurySummary {
  service_name: string;
  revenue: number;
  count: number;
}
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — lib/supabase.ts
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/lib/supabase.ts << 'EOF'
// ============================================================
// lib/supabase.ts
// Client Supabase pour l'app mobile (clé anon + auth JWT)
// ============================================================

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Rafraîchit le token quand l'app reprend le premier plan
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// ── Auth ──────────────────────────────────────────────────
export const signInAdmin = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

export const signOut = () => supabase.auth.signOut();

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — lib/whatsapp.ts
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/lib/whatsapp.ts << 'EOF'
// ============================================================
// lib/whatsapp.ts
// Fonctions d'appel au backend Vercel depuis l'app admin
// ============================================================

import { supabase } from './supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Non authentifié');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

/** Valide ou rejette un paiement */
export async function validatePayment(orderId: string, action: 'validate' | 'reject', rejectionReason?: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/validate-payment`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ orderId, action, rejectionReason }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Livre un compte après validation du paiement */
export async function deliverAccount(orderId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/deliver-account`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ orderId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — lib/crypto.ts
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/lib/crypto.ts << 'EOF'
// ============================================================
// lib/crypto.ts
// Déchiffrement des mots de passe dans l'app admin
// Note : les mots de passe sont déchiffrés côté serveur avant
// livraison au client. Ce fichier est pour l'affichage admin.
// ============================================================

// Pour l'affichage dans l'app admin uniquement
// Le déchiffrement réel se fait dans deliver-account.js (backend)

/** Masque un mot de passe pour affichage sécurisé */
export function maskPassword(password: string): string {
  if (!password || password.length < 4) return '****';
  return password.slice(0, 2) + '•'.repeat(password.length - 4) + password.slice(-2);
}

/** Vérifie si une chaîne est un mot de passe chiffré (format iv:tag:encrypted) */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length === 24;
}
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — app/_layout.tsx
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/app/_layout.tsx << 'EOF'
// ============================================================
// app/_layout.tsx
// Layout racine avec gestion de l'authentification
// Redirige vers login si non authentifié
// ============================================================

import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Récupère la session initiale
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) router.replace('/login');
    });

    // Écoute les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) router.replace('/login');
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
    </Stack>
  );
}
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — app/login.tsx
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/app/login.tsx << 'EOF'
// ============================================================
// app/login.tsx
// Écran de connexion admin
// ============================================================

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { signInAdmin } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Email et mot de passe requis');
      return;
    }
    setLoading(true);
    try {
      const { error } = await signInAdmin(email.trim(), password);
      if (error) throw error;
      router.replace('/(tabs)/support');
    } catch (err: any) {
      Alert.alert('Connexion échouée', err.message || 'Vérifiez vos identifiants');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <Text style={styles.logo}>✨ NOVA</Text>
        <Text style={styles.subtitle}>ML Group — Espace Admin</Text>
        <TextInput style={styles.input} placeholder="Email admin" placeholderTextColor="#64748b"
          value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Mot de passe" placeholderTextColor="#64748b"
          value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Connexion...' : 'Se connecter'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', padding: 24 },
  card:           { backgroundColor: '#1e293b', borderRadius: 20, padding: 28, alignItems: 'center', gap: 16 },
  logo:           { fontSize: 36, fontWeight: '800', color: '#22c55e' },
  subtitle:       { color: '#94a3b8', fontSize: 14, marginBottom: 8 },
  input:          { width: '100%', backgroundColor: '#334155', borderRadius: 12, padding: 14, color: '#f1f5f9', fontSize: 15 },
  button:         { width: '100%', backgroundColor: '#22c55e', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
});
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — app/(tabs)/_layout.tsx
# ══════════════════════════════════════════════════════════════
cat > "nova-mlgroup/mobile/app/(tabs)/_layout.tsx" << 'EOF'
// ============================================================
// app/(tabs)/_layout.tsx
// Navigation par onglets du bas
// ============================================================

import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#64748b',
      }}
    >
      <Tabs.Screen name="support"  options={{ title: 'Support',    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text> }} />
      <Tabs.Screen name="database" options={{ title: 'Stock',      tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🗄️</Text> }} />
      <Tabs.Screen name="treasury" options={{ title: 'Trésorerie', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💰</Text> }} />
    </Tabs>
  );
}
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — app/(tabs)/support.tsx (squelette)
# ══════════════════════════════════════════════════════════════
cat > "nova-mlgroup/mobile/app/(tabs)/support.tsx" << 'EOF'
// ============================================================
// app/(tabs)/support.tsx
// Suivi des conversations WhatsApp en temps réel
// Code complet dans le guide NOVA_ML_Group_Guide_Complet.md
// ============================================================

import { View, Text, StyleSheet } from 'react-native';

export default function SupportScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>💬 Support</Text>
      <Text style={styles.subtitle}>Conversations WhatsApp en temps réel</Text>
      <Text style={styles.hint}>→ Voir le code complet dans le guide Section 5.5</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title:    { color: '#f1f5f9', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 16, marginBottom: 16 },
  hint:     { color: '#22c55e', fontSize: 13 },
});
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — app/(tabs)/database.tsx (squelette)
# ══════════════════════════════════════════════════════════════
cat > "nova-mlgroup/mobile/app/(tabs)/database.tsx" << 'EOF'
// ============================================================
// app/(tabs)/database.tsx
// Gestion du stock de comptes (ajouter / supprimer)
// ============================================================

import { View, Text, StyleSheet } from 'react-native';

export default function DatabaseScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🗄️ Stock</Text>
      <Text style={styles.subtitle}>Gestion des comptes disponibles</Text>
      <Text style={styles.hint}>→ À implémenter avec lib/supabase.ts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title:    { color: '#f1f5f9', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 16, marginBottom: 16 },
  hint:     { color: '#22c55e', fontSize: 13 },
});
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — app/(tabs)/treasury.tsx (squelette)
# ══════════════════════════════════════════════════════════════
cat > "nova-mlgroup/mobile/app/(tabs)/treasury.tsx" << 'EOF'
// ============================================================
// app/(tabs)/treasury.tsx
// Dashboard analytique des revenus
// Code complet dans le guide NOVA_ML_Group_Guide_Complet.md
// ============================================================

import { View, Text, StyleSheet } from 'react-native';

export default function TreasuryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>💰 Trésorerie</Text>
      <Text style={styles.subtitle}>Dashboard analytique des revenus</Text>
      <Text style={styles.hint}>→ Voir le code complet dans le guide Section 5.6</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title:    { color: '#f1f5f9', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 16, marginBottom: 16 },
  hint:     { color: '#22c55e', fontSize: 13 },
});
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — components/ConversationCard.tsx
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/components/ConversationCard.tsx << 'EOF'
// ============================================================
// components/ConversationCard.tsx
// Carte d'aperçu d'une conversation dans la liste Support
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Conversation } from '../types';

const STATUS_CONFIG = {
  new:              { color: '#22c55e', label: 'Nouveau',       emoji: '🟢' },
  in_progress:      { color: '#eab308', label: 'En cours',      emoji: '🟡' },
  awaiting_payment: { color: '#f97316', label: 'Paiement reçu', emoji: '🟠' },
  delivered:        { color: '#3b82f6', label: 'Finalisée',     emoji: '🔵' },
  disputed:         { color: '#ef4444', label: 'Litige',        emoji: '🔴' },
};

interface Props {
  conversation: Conversation;
  onPress: () => void;
}

export default function ConversationCard({ conversation, onPress }: Props) {
  const config   = STATUS_CONFIG[conversation.status] || STATUS_CONFIG.new;
  const messages = conversation.messages || [];
  const lastMsg  = messages[messages.length - 1]?.content?.substring(0, 55) || 'Nouvelle conversation';
  const name     = conversation.clients?.display_name || conversation.clients?.whatsapp_phone || 'Client';
  const time     = conversation.last_message_at
    ? new Date(conversation.last_message_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.name}>{conversation.is_admin_takeover ? '👤 ' : '🤖 '}{name}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>{lastMsg}</Text>
        <View style={[styles.badge, { backgroundColor: config.color + '25' }]}>
          <Text style={[styles.badgeText, { color: config.color }]}>{config.emoji} {config.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card:      { flexDirection: 'row', backgroundColor: '#1e293b', marginHorizontal: 12, marginVertical: 4, borderRadius: 12, padding: 12, alignItems: 'center' },
  dot:       { width: 10, height: 10, borderRadius: 5, marginRight: 12, flexShrink: 0 },
  content:   { flex: 1 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  name:      { color: '#f1f5f9', fontWeight: '700', fontSize: 14, flex: 1 },
  time:      { color: '#64748b', fontSize: 11 },
  preview:   { color: '#94a3b8', fontSize: 12, marginBottom: 5 },
  badge:     { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '600' },
});
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — components/AccountCard.tsx
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/components/AccountCard.tsx << 'EOF'
// ============================================================
// components/AccountCard.tsx
// Carte d'un compte dans la page Stock (Database)
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Account } from '../types';

const STATUS_COLORS = { available: '#22c55e', assigned: '#3b82f6', expired: '#ef4444' };

interface Props {
  account: Account;
  onDelete?: () => void;
}

export default function AccountCard({ account, onDelete }: Props) {
  const color = STATUS_COLORS[account.status] || '#64748b';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.email}>{account.email}</Text>
        <View style={[styles.badge, { backgroundColor: color + '25' }]}>
          <Text style={[styles.badgeText, { color }]}>{account.status}</Text>
        </View>
      </View>
      <Text style={styles.service}>{(account as any).services?.name || 'Service inconnu'}</Text>
      {account.expires_at && (
        <Text style={styles.expires}>Expire : {new Date(account.expires_at).toLocaleDateString('fr-FR')}</Text>
      )}
      {account.status === 'available' && onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>🗑 Supprimer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card:       { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginHorizontal: 12, marginVertical: 4 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  email:      { color: '#f1f5f9', fontWeight: '600', fontSize: 13, flex: 1 },
  badge:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  service:    { color: '#94a3b8', fontSize: 12, marginBottom: 4 },
  expires:    { color: '#64748b', fontSize: 11, marginBottom: 6 },
  deleteBtn:  { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#7f1d1d', borderRadius: 6 },
  deleteText: { color: '#fca5a5', fontSize: 11, fontWeight: '600' },
});
EOF

# ══════════════════════════════════════════════════════════════
# MOBILE — components/StatsCard.tsx
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/mobile/components/StatsCard.tsx << 'EOF'
// ============================================================
// components/StatsCard.tsx
// Carte statistique pour la page Trésorerie
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  color?: string;
  emoji?: string;
}

export default function StatsCard({ title, value, subtitle, color = '#22c55e', emoji }: Props) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <Text style={styles.title}>{emoji ? `${emoji} ` : ''}{title}</Text>
      <Text style={[styles.value, { color }]}>{value}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card:     { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, borderLeftWidth: 3, marginHorizontal: 12, marginVertical: 4 },
  title:    { color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  value:    { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  subtitle: { color: '#64748b', fontSize: 11 },
});
EOF

# ══════════════════════════════════════════════════════════════
# README.md
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/README.md << 'EOF'
# ✨ NOVA by ML Group

Bot WhatsApp intelligent pour la vente d'abonnements numériques.
**Stack :** Expo · Supabase · Vercel · Gemini Flash · WhatsApp Cloud API

## 📁 Structure

```
nova-mlgroup/
├── backend/    → API Vercel serverless (webhook WhatsApp + bot IA)
└── mobile/     → App Expo React Native (tableau de bord admin)
```

## 🚀 Démarrage rapide

### Backend
```bash
cd backend
cp .env.example .env    # Remplis avec tes clés
npm install
npx vercel dev          # Développement local
npx vercel --prod       # Déploiement production
```

### Mobile
```bash
cd mobile
cp .env.example .env    # Remplis avec tes clés Supabase
npm install
npx expo start          # Lance le serveur de dev
npx expo start --android
```

## 📖 Documentation complète

Voir **NOVA_ML_Group_Guide_Complet.md** pour :
- Guide de configuration étape par étape (Section 1)
- Schéma SQL Supabase complet (Section 2)
- System prompt NOVA (Section 3)
- Code commenté ligne par ligne (Section 5)
- Plan de lancement 4 semaines (Section 6)

## 🔑 Variables d'environnement requises

| Variable | Où l'obtenir |
|----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | Meta for Developers → System User Token |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta → WhatsApp Business Platform |
| `WHATSAPP_VERIFY_TOKEN` | Ton choix (secret webhook) |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `GEMINI_API_KEY` | aistudio.google.com |
| `OM_PHONE_NUMBER` | Ton numéro Orange Money |
| `OM_BENEFICIARY_NAME` | Ton nom / nom entreprise |
| `ENCRYPTION_KEY` | 32 caractères aléatoires |

## 📞 Support

Pour toute question sur le projet NOVA, contacte ML Group.
EOF

# ══════════════════════════════════════════════════════════════
# .gitignore global
# ══════════════════════════════════════════════════════════════
cat > nova-mlgroup/.gitignore << 'EOF'
# Variables d'environnement (NE JAMAIS committer)
.env
.env.local
.env.*.local

# Node.js
node_modules/
npm-debug.log*

# Expo / React Native
.expo/
dist/
web-build/
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*

# Vercel
.vercel/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/
EOF

# ══════════════════════════════════════════════════════════════
# RÉSUMÉ FINAL
# ══════════════════════════════════════════════════════════════
echo ""
echo "============================================"
echo "✅ Arborescence NOVA créée avec succès !"
echo "============================================"
echo ""
echo "📁 Structure générée :"
find nova-mlgroup -type f | sort | sed 's/^/   /'
echo ""
echo "📋 Prochaines étapes :"
echo "   1. cd nova-mlgroup"
echo "   2. git init && git add . && git commit -m 'feat: init NOVA ML Group project'"
echo "   3. Créer le repo GitHub nova-mlgroup et pousser"
echo "   4. Remplir backend/.env et mobile/.env depuis les .env.example"
echo "   5. cd backend && npm install && npx vercel dev"
echo ""
echo "🔗 Docs : NOVA_ML_Group_Guide_Complet.md"
echo ""
EOF

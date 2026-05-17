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

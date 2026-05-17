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

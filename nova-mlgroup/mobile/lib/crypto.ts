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

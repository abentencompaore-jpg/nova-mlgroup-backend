#!/bin/bash
# ============================================================
# fix-all.sh — Corrige tous les problèmes d'installation
# Exécute depuis : /workspaces/nova-mlgroup-backend
# Commande : bash fix-all.sh
# ============================================================

echo "🔧 Correction de tous les problèmes..."

# ── DOSSIER MOBILE ───────────────────────────────────────────
cd /workspaces/nova-mlgroup-backend/nova-mlgroup/mobile

echo "📦 Réinstallation des packages Expo dans le BON dossier..."

# Supprimer et réinstaller proprement
rm -rf node_modules package-lock.json

# Installer expo en premier
npm install expo@~51.0.0

# Installer les packages biométriques correctement
npx expo install \
  expo-local-authentication \
  expo-application \
  expo-secure-store \
  expo-device \
  expo-router \
  expo-status-bar

# Installer les autres dépendances
npm install \
  @supabase/supabase-js \
  @react-native-async-storage/async-storage \
  react-native-url-polyfill \
  react-native-safe-area-context \
  react-native-screens

# Installer les types TypeScript manquants
npm install --save-dev \
  @types/react \
  @types/react-native \
  typescript@~5.3.3

echo "✅ Packages mobile installés"

# ── DOSSIER BACKEND ──────────────────────────────────────────
cd /workspaces/nova-mlgroup-backend/nova-mlgroup/backend

echo "📦 Installation des dépendances backend..."
npm install dotenv
echo "✅ Backend prêt"

echo ""
echo "🎉 Tout est installé ! Lance maintenant :"
echo "   cd nova-mlgroup/mobile && npx expo start"

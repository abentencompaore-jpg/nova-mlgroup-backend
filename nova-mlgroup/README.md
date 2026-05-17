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

// ============================================================
// api/process-ai.js — CHAÎNE 5 PROVIDERS VÉRIFIÉS GRATUITS
//
// Recherche Mai 2026 — tous vérifiés sans carte bancaire :
//
// 1. Mistral      → mistral-small-latest  (meilleur français, 1B tokens/mois)
// 2. Cerebras     → llama3.1-70b          (ultra-rapide, 1M tokens/jour)
// 3. Groq         → llama-3.3-70b-versatile (rapide, 30 req/min)
// 4. SambaNova    → Meta-Llama-3.3-70B-Instruct (gratuit permanent)
// 5. OpenRouter   → llama-3.3-70b-instruct:free (20 req/min, cas extrême)
//
// ⚠️ Together AI RETIRÉ : crédits $25 qui expirent → pas gratuit en permanence
// ⚠️ Cerebras : llama-3.3-70b déprécié fév 2026 → llama3.1-70b utilisé
//
// Clés à ajouter dans Vercel → Settings → Environment Variables :
//   MISTRAL_API_KEY      → console.mistral.ai (phone verification only)
//   CEREBRAS_API_KEY     → cloud.cerebras.ai
//   GROQ_API_KEY         → console.groq.com
//   SAMBANOVA_API_KEY    → cloud.sambanova.ai
//   OPENROUTER_API_KEY   → openrouter.ai/keys
// ============================================================

const PROVIDERS = [
  {
    name:    'Mistral',
    url:     'https://api.mistral.ai/v1/chat/completions',
    model:   'mistral-small-latest',
    // Meilleur pour le français — entraîné par une équipe française
    // Free tier : 1B tokens/mois, taux de succès très élevé
    apiKey:  () => process.env.MISTRAL_API_KEY,
    timeout: 10000,
  },
  {
    name:    'Cerebras',
    url:     'https://api.cerebras.ai/v1/chat/completions',
    model:   'llama3.1-70b',
    // Puces wafer-scale propriétaires → inference en <500ms
    // Free tier : 1M tokens/jour, 30 RPM
    // Note : contexte limité à 8192 tokens
    apiKey:  () => process.env.CEREBRAS_API_KEY,
    timeout: 6000,
  },
  {
    name:    'Groq',
    url:     'https://api.groq.com/openai/v1/chat/completions',
    model:   'llama-3.3-70b-versatile',
    // LPU (Language Processing Units) — très rapide
    // Free tier : 30 RPM, 6000 TPM, aucune expiration
    apiKey:  () => process.env.GROQ_API_KEY,
    timeout: 8000,
  },
  {
    name:    'SambaNova',
    url:     'https://api.sambanova.ai/v1/chat/completions',
    model:   'Meta-Llama-3.3-70B-Instruct',
    // Infrastructure Silicon Valley dédiée inference
    // Free tier permanent : 10K req/jour, aucune carte bancaire
    apiKey:  () => process.env.SAMBANOVA_API_KEY,
    timeout: 10000,
  },
  {
    name:    'OpenRouter',
    url:     'https://openrouter.ai/api/v1/chat/completions',
    model:   'meta-llama/llama-3.3-70b-instruct:free',
    // Agrégateur → route vers le meilleur provider disponible
    // Free : 20 req/min, 200 req/jour, modèles `:free` gratuits
    // Fiabilité "best-effort" → réservé au cas extrême
    apiKey:  () => process.env.OPENROUTER_API_KEY,
    timeout: 12000,
    extraHeaders: {
      'HTTP-Referer': 'https://nova-mlgroup-backend.vercel.app',
      'X-Title':      'NOVA by ML Group',
    },
  },
];

// ─────────────────────────────────────────────────────────────
// APPEL PROVIDER (format OpenAI — universel)
// ─────────────────────────────────────────────────────────────
async function callProvider(provider, systemPrompt, history) {
  const apiKey = provider.apiKey();
  if (!apiKey) throw new Error(`Clé ${provider.name} manquante`);

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), provider.timeout);

  try {
    const response = await fetch(provider.url, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        ...(provider.extraHeaders || {}),
      },
      body: JSON.stringify({
        model:       provider.model,
        messages:    [
          { role: 'system', content: systemPrompt },
          ...history,
        ],
        max_tokens:  512,
        temperature: 0.75,
        stream:      false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err.name === 'AbortError'
      ? new Error(`Timeout ${provider.name} (${provider.timeout}ms)`)
      : err;
  }
}

// ─────────────────────────────────────────────────────────────
// PARSER LA RÉPONSE ET EXTRAIRE LE SYSTEM_ACTION
// ─────────────────────────────────────────────────────────────
function parseResponse(rawText) {
  // Regex robuste : capture le JSON entre la dernière accolade
  const match = rawText.match(/\nSYSTEM_ACTION:\s*(\{[^{}]+\})\s*$/m);

  if (!match) return { responseText: rawText.trim(), systemAction: null };

  let systemAction = null;
  try { systemAction = JSON.parse(match[1]); } catch { /* JSON mal formé */ }

  const responseText = rawText.replace(/\nSYSTEM_ACTION:[\s\S]*$/, '').trim();
  return { responseText, systemAction };
}

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT NOVA — Intelligence commerciale complète
// ─────────────────────────────────────────────────────────────
function buildSystemPrompt(context) {
  const now       = new Date();
  const monthNum  = now.getMonth() + 1;
  const monthName = now.toLocaleString('fr-FR', { month: 'long' });
  const hour      = now.getHours();

  const greeting =
    hour < 5  ? 'Bonne nuit' :
    hour < 12 ? 'Bonne matinée' :
    hour < 18 ? 'Bonne après-midi' :
                'Bonne soirée';

  const seasonalSuggestion =
    monthNum === 12 || monthNum === 1 ? 'Disney+ (parfait pour les films de fêtes en famille 🎄)'  :
    monthNum >= 6  && monthNum <= 8   ? 'Spotify (playlists de l\'été pour profiter des vacances ☀️)' :
    monthNum >= 9  && monthNum <= 10  ? 'Canva Pro (idéal pour les projets de rentrée 🎓)'           :
    monthNum >= 2  && monthNum <= 3   ? 'Netflix (parfait pour les soirées fraîches 🌙)'             :
                                        'un service complémentaire à ce que le client vient d\'acheter';

  const clientLabel   = context.clientName   || 'Nouveau client';
  const orderLabel    = context.currentOrder
    ? `${context.currentOrder.service} — ${context.currentOrder.duration} mois — ${context.currentOrder.amount} F CFA (${context.currentOrder.status})`
    : 'Aucune commande en cours';

  return `Tu es NOVA, l'assistante commerciale de ML Group — startup digitale à Ouagadougou, Burkina Faso. Tu vends des abonnements numériques via WhatsApp.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌟 QUI TU ES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ton prénom : NOVA
Entreprise : ML Group (Ouagadougou, Burkina Faso)
Personnalité : Jeune, dynamique, chaleureuse, directe — comme une amie commerciale de confiance. Jamais robotique, jamais froide.
Style : Naturel et fluide. Emojis avec modération, uniquement quand ils ajoutent de la valeur.
Valeurs : Rapidité d'exécution, transparence totale, service client irréprochable.

Message d'accueil — UNIQUEMENT pour les tout premiers messages d'un nouveau client :
"Salut ! 👋 Je suis NOVA, ton assistante chez ML Group ✨ Je suis là pour t'aider à accéder à tes services favoris rapidement. C'est quoi ton projet aujourd'hui ? 🚀"

Pour un client connu (tu connais son prénom) :
"Re-bonjour ${context.clientName || '[prénom]'} ! 😊 Content(e) de te revoir chez ML Group. Qu'est-ce que je peux faire pour toi aujourd'hui ?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 CATALOGUE TARIFAIRE OFFICIEL (PRIX FIXES — JAMAIS NÉGOCIABLES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 STREAMING VIDÉO
• Netflix          → 2 500 F CFA / mois
• Prime Video      → 3 500 F CFA / mois
• Crunchyroll      → 3 000 F CFA / mois (anime)
• Disney+          → 5 500 F CFA / mois
• Plex TV          → 8 500 F CFA / mois
• My Canal         → 5 000 F CFA / mois
• IPTV             → 18 000 F CFA / 6 mois (TV en direct)

🎵 MUSIQUE
• Spotify          → 3 000 F CFA / mois
• Apple Music      → 4 000 F CFA / mois

🎮 GAMING
• PlayStation+     → 8 000 F CFA / mois

✏️ PRODUCTIVITÉ & CRÉATIVITÉ
• Canva Pro        → 4 000 F CFA / mois
• CapCut Pro       → 9 500 F CFA / mois
• iCloud 200 Go    → 3 500 F CFA / mois

📱 RÉSEAUX SOCIAUX
• Snapchat+        → 10 000 F CFA / an

🔒 SÉCURITÉ
• VPN              → 3 000 F CFA / mois

🎯 ABONNEMENT PERSONNALISÉ
• Sur demande      → à partir de 2 400 F CFA / mois
  (Escalade systématique à l'administrateur)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 TON INTELLIGENCE COMMERCIALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tu es une commerciale expérimentée. Ces principes sont naturellement intégrés dans ton comportement :

① DÉCOUVERTE EFFICACE
Quand le client ne sait pas ce qu'il veut, pose UNE seule question ouverte pour cerner son profil :
"Tu cherches plutôt pour le divertissement (films, séries, musique), pour créer du contenu, pour jouer, ou autre chose ? 😊"
Adapte ta recommandation en fonction de la réponse.

② RECOMMANDATION CIBLÉE
Ne liste JAMAIS tout le catalogue d'un coup. Recommande 2 à 3 services maximum avec une justification courte et convaincante.
Exemple : "Pour les séries et films, Netflix est notre best-seller à 2 500 F/mois 🔥 Des milliers de contenus disponibles immédiatement."

③ CRÉATION D'URGENCE DOUCE (naturelle, jamais forcée)
"Netflix est notre service le plus demandé ce mois-ci 🔥"
"On a encore de la disponibilité pour ce service 😊"

④ GESTION EXPERTE DES OBJECTIONS
• "C'est cher" → "Netflix à 2 500 F c'est 83 F par jour — moins qu'une bouteille d'eau 😊 Pour du contenu illimité."
• "Je dois réfléchir" → "Bien sûr ! Qu'est-ce qui te fait hésiter ? Peut-être que je peux t'aider 😊"
• "Je veux une réduction" → "Les prix sont fixes pour garantir la qualité du service 😊 Ce sont déjà les meilleurs tarifs disponibles à Ouaga !"
• "Paiement différé ?" → "On ne fait pas les crédits pour l'instant, mais dès que tu es prêt je suis là 😊"
• "Je vais voir ailleurs" → "Bien sûr ! Mais n'hésite pas à revenir — ici tu as le meilleur rapport qualité/prix de la place 😊"

⑤ UPSELL CONTEXTUEL (uniquement après livraison réussie)
Propose UN seul service complémentaire en contexte.
Ce mois de ${monthName} : suggère ${seasonalSuggestion}.
Si le client refuse ou ignore → n'insiste JAMAIS, change de sujet.

⑥ PERSONNALISATION
Utilise le prénom "${clientLabel}" naturellement dans la conversation quand tu le connais.
Mémorise le contexte : ce que le client a acheté, ce qu'il cherche, ses préférences.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 FLUX DE VENTE — 8 PHASES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[PHASE 1 — ACCUEIL]
Nouveau client → message signature complet.
Client connu → salutation courte et personnalisée avec son prénom.

[PHASE 2 — DÉCOUVERTE]
Si le client hésite, présente le catalogue visuellement par catégories :
"On a de tout chez nous 🎯
🎬 Streaming : Netflix, Prime Video, Disney+, Crunchyroll, Plex, Canal, IPTV
🎵 Musique : Spotify, Apple Music | 🎮 Gaming : PlayStation+
✏️ Créativité : Canva Pro, CapCut, iCloud | 📱 Réseaux : Snapchat+ | 🔒 Sécurité : VPN
C'est pour quel usage ? 😊"

[PHASE 3 — QUALIFICATION ET RECOMMANDATION]
Pose une question si nécessaire. Recommande 2-3 services avec justification.

[PHASE 4 — DEVIS CLAIR]
Confirme service, durée et total.
"Netflix — 1 mois = 2 500 F CFA ✅ Ça te convient ?"
"Netflix — 3 mois = 7 500 F CFA 🎬 C'est bon pour toi ?"

[PHASE 5 — RÉCAPITULATIF AVANT PAIEMENT]
Toujours faire un récapitulatif avant les infos de paiement :
"Récap de ta commande 📋
📦 Service : [Service]
⏱️ Durée : [X mois / 1 an]
💰 Total : [MONTANT] F CFA
On confirme ?"

[PHASE 6 — INSTRUCTIONS DE PAIEMENT]
"Parfait ! 💳 Envoie [MONTANT] F CFA via Orange Money au :
📱 Numéro : ${process.env.OM_PHONE_NUMBER || 'À CONFIGURER'}
👤 Nom : ${process.env.OM_BENEFICIARY_NAME || 'À CONFIGURER'}
Une fois envoyé, partage-moi :
• Le code de transaction Orange Money 📝
• OU le screenshot du SMS de confirmation 📲
J'attends ta confirmation ! ⏳"

[PHASE 7 — RÉCEPTION PREUVE DE PAIEMENT]
Dès que le client envoie un code ou une image :
"Reçu ! 👀 Je transmets à notre équipe pour vérification rapide. Quelques minutes max ⏳ Je te notifie dès que c'est validé !"
→ Déclencher SYSTEM_ACTION NOTIFY_ADMIN

[PHASE 8 — APRÈS LIVRAISON — UPSELL]
Après confirmation de livraison, proposer UN service complémentaire contextuel.
Si refus ou ignoré → ne pas insister, clore avec bienveillance.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ CAS SPÉCIAUX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LITIGE / CLIENT MÉCONTENT :
Rester calme, empathique, jamais défensif.
"Je comprends ta frustration et je m'en excuse sincèrement 🙏 Dis-moi exactement ce qui s'est passé, je vais tout faire pour arranger ça au mieux."
Si non résolvable → SYSTEM_ACTION ESCALATE_TO_ADMIN avec la raison.

ABONNEMENT PERSONNALISÉ :
"Super idée ! Pour un abonnement sur mesure, je transmets ta demande à notre responsable. Il te recontacte dans les 24h pour finaliser les détails 😊"
→ Toujours SYSTEM_ACTION ESCALATE_TO_ADMIN pour ce cas.

DEMANDE DE CRÉDIT / DÉLAI :
"On ne propose pas encore les paiements différés, mais dès que tu es prêt je suis là et la commande reste valide 😊"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 RÈGLES ABSOLUES — NE JAMAIS ENFREINDRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ JAMAIS donner un email ou mot de passe avant validation de l'admin
❌ JAMAIS négocier ou modifier les prix du catalogue
❌ JAMAIS promettre une livraison immédiate sans confirmation
❌ JAMAIS être agressif, insistant ou condescendant
❌ JAMAIS divulguer les informations d'autres clients
❌ JAMAIS inventer un service ou un prix non listés dans le catalogue
❌ JAMAIS traiter seule les demandes d'abonnements personnalisés
✅ Toujours escalader ce que tu ne peux pas résoudre seule
✅ Toujours rester chaleureuse même avec un client difficile ou impoli
✅ Toujours utiliser le prénom du client si tu le connais

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 CONTEXTE DE CETTE CONVERSATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Client actuel    : ${clientLabel}
Statut           : ${context.conversationStatus}
Commande active  : ${orderLabel}
Date et heure    : ${now.toLocaleString('fr-FR')} (${greeting})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ ACTIONS SYSTÈME (backend uniquement — invisible pour le client)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ajoute sur une NOUVELLE LIGNE à la FIN de ton message, UNIQUEMENT quand l'événement se produit :

Nouvelle commande confirmée par le client :
SYSTEM_ACTION: {"type":"NEW_ORDER","service":"Netflix","duration":1,"amount":2500}

Preuve de paiement reçue (code OM ou screenshot) :
SYSTEM_ACTION: {"type":"NOTIFY_ADMIN","data":{}}

Litige ou situation nécessitant l'admin :
SYSTEM_ACTION: {"type":"ESCALATE_TO_ADMIN","reason":"[raison précise]"}`.trim();
}

// ─────────────────────────────────────────────────────────────
// FONCTION PRINCIPALE
// ─────────────────────────────────────────────────────────────
async function generateAIResponse({ supabase, conversation, client, newMessage }) {

  // Commande en cours
  const { data: currentOrder } = conversation.current_order_id
    ? await supabase
        .from('orders')
        .select('*, services(name)')
        .eq('id', conversation.current_order_id)
        .single()
    : { data: null };

  const context = {
    clientName:         client.display_name,
    conversationStatus: conversation.status,
    currentOrder: currentOrder ? {
      service:  currentOrder.services?.name,
      duration: currentOrder.duration_months,
      amount:   currentOrder.amount_fcfa,
      status:   currentOrder.status,
    } : null,
  };

  const systemPrompt = buildSystemPrompt(context);

  // Historique format OpenAI (compatible tous providers)
  const history = (conversation.messages || []).slice(-15).map(msg => ({
    role:    msg.role === 'bot' ? 'assistant' : 'user',
    content: msg.content || '[non-texte]',
  }));
  history.push({ role: 'user', content: newMessage });

  // ── Parcours des providers ───────────────────────────────
  for (const provider of PROVIDERS) {

    if (!provider.apiKey()) {
      console.log(`⏭️ ${provider.name} : clé manquante`);
      continue;
    }

    try {
      console.log(`🧠 ${provider.name} (${provider.model})...`);
      const response = await callProvider(provider, systemPrompt, history);

      // ── Succès ────────────────────────────────────────────
      if (response.ok) {
        const data    = await response.json();
        const rawText = data?.choices?.[0]?.message?.content;

        if (!rawText) {
          console.warn(`⚠️ ${provider.name} : réponse vide`);
          continue;
        }

        const result = parseResponse(rawText);
        console.log(`✅ ${provider.name} OK — ${result.responseText.length} chars${result.systemAction ? ` + ${result.systemAction.type}` : ''}`);
        return result;
      }

      // ── Rate limit 429 : une tentative de retry ───────────
      if (response.status === 429) {
        console.log(`⏳ ${provider.name} 429 — retry dans 400ms...`);
        await new Promise(r => setTimeout(r, 400));

        try {
          const retry = await callProvider(provider, systemPrompt, history);
          if (retry.ok) {
            const data    = await retry.json();
            const rawText = data?.choices?.[0]?.message?.content;
            if (rawText) {
              const result = parseResponse(rawText);
              console.log(`✅ ${provider.name} retry OK — ${result.responseText.length} chars`);
              return result;
            }
          }
        } catch { /* retry échoué */ }

        console.log(`⏭️ ${provider.name} toujours 429 → provider suivant`);
        continue;
      }

      // ── Erreur serveur 5xx : passe immédiatement au suivant ─
      if (response.status >= 500) {
        const body = await response.json().catch(() => ({}));
        console.log(`⏭️ ${provider.name} ${response.status} : ${body?.error?.message || 'erreur serveur'}`);
        continue;
      }

      // ── Autre erreur ──────────────────────────────────────
      const err = await response.json().catch(() => ({}));
      console.log(`⏭️ ${provider.name} ${response.status} : ${err?.error?.message || 'erreur inconnue'}`);

    } catch (err) {
      console.log(`⏭️ ${provider.name} exception : ${err.message}`);
    }
  }

  // Tous les providers ont échoué
  console.error('❌ Tous les providers IA ont échoué');
  return {
    responseText: "Désolé, je rencontre un souci technique 😅 Notre équipe revient vers toi très vite 💪",
    systemAction: null,
  };
}

module.exports = { generateAIResponse };
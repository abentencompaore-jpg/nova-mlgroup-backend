// ============================================================
// api/process-ai.js — GROQ (PRIMARY) + GEMINI (FALLBACK)
//
// Groq : gratuit, <1s de réponse, 30 req/min, très fiable
// Gemini : fallback si Groq rate-limite (rare)
//
// Modèles Groq :
//   llama-3.3-70b-versatile → intelligent, recommandé
//   llama-3.1-8b-instant    → ultra-rapide, fallback Groq
// ============================================================

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT NOVA (inchangé)
// ─────────────────────────────────────────────────────────────
function buildSystemPrompt(context) {
  const now       = new Date();
  const monthNum  = now.getMonth() + 1;
  const monthName = now.toLocaleString('fr-FR', { month: 'long' });
  const hour      = now.getHours();
  const greeting  = hour < 12 ? 'Bonne matinée' : hour < 18 ? 'Bonne après-midi' : 'Bonne soirée';

  const seasonalTip =
    monthNum === 12 || monthNum === 1 ? 'Disney+ (films de fêtes 🎄)' :
    monthNum >= 6  && monthNum <= 8   ? 'Spotify (playlists vacances ☀️)' :
    monthNum >= 9  && monthNum <= 10  ? 'Canva Pro (projets de rentrée 🎓)' :
    'un service complémentaire à ce que le client vient d\'acheter';

  return `Tu es NOVA, l'assistante commerciale de ML Group — startup digitale à Ouagadougou, Burkina Faso.

━━━━━━━━━━━━━━━━━━━━━
🌟 IDENTITÉ
━━━━━━━━━━━━━━━━━━━━━
Ton : Jeune, dynamique, chaleureuse, directe — comme une amie commerciale de confiance.
Style : Naturel, jamais robotique. Emojis avec modération.
Message d'accueil (UNIQUEMENT nouveaux clients) :
"Salut ! 👋 Je suis NOVA, ton assistante chez ML Group ✨ Je suis là pour t'aider à accéder à tes services favoris rapidement. C'est quoi ton projet aujourd'hui ? 🚀"

━━━━━━━━━━━━━━━━━━━━━
💰 CATALOGUE (PRIX FIXES — NON NÉGOCIABLES)
━━━━━━━━━━━━━━━━━━━━━
🎬 Netflix 2500F/mois | Prime Video 3500F/mois | Crunchyroll 3000F/mois | Disney+ 5500F/mois | Plex TV 8500F/mois | My Canal 5000F/mois | IPTV 18000F/6mois
🎵 Spotify 3000F/mois | Apple Music 4000F/mois
🎮 PlayStation+ 8000F/mois
✏️ Canva Pro 4000F/mois | CapCut Pro 9500F/mois | iCloud 200Go 3500F/mois
📱 Snapchat+ 10000F/an
🔒 VPN 3000F/mois
🎯 Personnalisé dès 2400F/mois

━━━━━━━━━━━━━━━━━━━━━
🧠 INTELLIGENCE COMMERCIALE
━━━━━━━━━━━━━━━━━━━━━
1. DÉCOUVERTE : Si le client hésite → UNE seule question ouverte pour cerner son profil.
2. RECOMMANDATION : Jamais tout le catalogue. Max 3 services avec justification courte.
3. URGENCE DOUCE : "Netflix est notre service le plus populaire 🔥"
4. OBJECTIONS :
   - "C'est cher" → valeur quotidienne ("Netflix = 83F/jour, moins qu'un café ☕")
   - "Je réfléchis" → "Qu'est-ce qui te fait hésiter ? 😊"
   - "Réduction" → "Les prix sont fixes pour garantir la qualité 😊 Ce sont les meilleurs tarifs du marché !"
5. UPSELL (après livraison) : UN seul service complémentaire ce mois de ${monthName} : ${seasonalTip}. Si refus → n'insiste JAMAIS.
6. PRÉNOM : Utilise ${context.clientName ? `"${context.clientName}"` : 'le prénom si tu le connais'} naturellement.

━━━━━━━━━━━━━━━━━━━━━
🔄 FLUX DE VENTE
━━━━━━━━━━━━━━━━━━━━━
[ACCUEIL] Nouveau → message signature. Connu → "Re-bonjour [prénom] ! 😊"
[DÉCOUVERTE] Présente le catalogue par catégories si le client ne sait pas.
[RECOMMANDATION] Propose avec justification.
[DEVIS] Confirme service + durée + total.
[RÉCAP] Avant paiement : service, durée, montant total.
[PAIEMENT] "Envoie [MONTANT] F CFA via Orange Money au 📱 ${process.env.OM_PHONE_NUMBER || 'À CONFIGURER'} — Nom : ${process.env.OM_BENEFICIARY_NAME || 'À CONFIGURER'}. Partage le code transaction ou screenshot SMS 📲"
[PREUVE REÇUE] "Reçu ! 👀 Vérification en cours ⏳" → SYSTEM_ACTION NOTIFY_ADMIN
[POST-LIVRAISON] Upsell contextuel une seule fois.

━━━━━━━━━━━━━━━━━━━━━
⚡ CAS SPÉCIAUX
━━━━━━━━━━━━━━━━━━━━━
LITIGE : "Je comprends ta frustration 🙏 Dis-moi ce qui s'est passé." → ESCALATE_TO_ADMIN si non résolvable.
PERSONNALISÉ : "Notre responsable te recontacte sous 24h 😊" → ESCALATE_TO_ADMIN
CRÉDIT : "On ne fait pas les crédits pour le moment, mais dès que tu es prêt je suis là ! 😊"

━━━━━━━━━━━━━━━━━━━━━
🚨 RÈGLES ABSOLUES
━━━━━━━━━━━━━━━━━━━━━
❌ Jamais email/mdp avant validation admin
❌ Jamais négocier les prix
❌ Jamais inventer service ou prix
✅ Toujours escalader ce que tu ne peux résoudre
✅ Toujours rester chaleureuse

━━━━━━━━━━━━━━━━━━━━━
📌 CONTEXTE
━━━━━━━━━━━━━━━━━━━━━
Client : ${context.clientName || 'Nouveau'}
Statut conversation : ${context.conversationStatus}
Commande en cours : ${context.currentOrder ? `${context.currentOrder.service} — ${context.currentOrder.duration}mois — ${context.currentOrder.amount}F (${context.currentOrder.status})` : 'Aucune'}
Heure : ${now.toLocaleString('fr-FR')} (${greeting})

━━━━━━━━━━━━━━━━━━━━━
⚙️ ACTIONS SYSTÈME (invisible client, nouvelle ligne à la fin si nécessaire)
━━━━━━━━━━━━━━━━━━━━━
SYSTEM_ACTION: {"type":"NEW_ORDER","service":"Netflix","duration":1,"amount":2500}
SYSTEM_ACTION: {"type":"NOTIFY_ADMIN","data":{}}
SYSTEM_ACTION: {"type":"ESCALATE_TO_ADMIN","reason":"litige"}`.trim();
}

// ─────────────────────────────────────────────────────────────
// APPEL GROQ (format OpenAI)
// ─────────────────────────────────────────────────────────────
async function callGroq(model, systemPrompt, history, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(GROQ_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history
        ],
        max_tokens:  512,
        temperature: 0.75,
        stream:      false
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// APPEL GEMINI (fallback)
// ─────────────────────────────────────────────────────────────
async function callGemini(systemPrompt, history, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Convertit le format OpenAI → format Gemini
  const geminiContents = history.map(msg => ({
    role:  msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  try {
    const response = await fetch(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { temperature: 0.75, maxOutputTokens: 512 }
        }),
        signal: controller.signal
      }
    );
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// PARSER LA RÉPONSE BRUTE
// ─────────────────────────────────────────────────────────────
function parseResponse(rawText) {
  const actionMatch = rawText.match(/\nSYSTEM_ACTION:\s*(\{[^}]+\})/);
  let responseText  = rawText;
  let systemAction  = null;

  if (actionMatch) {
    try { systemAction = JSON.parse(actionMatch[1]); } catch { /* ignore */ }
    responseText = rawText.replace(/\nSYSTEM_ACTION:[\s\S]*$/, '').trim();
  }

  return { responseText, systemAction };
}

// ─────────────────────────────────────────────────────────────
// FONCTION PRINCIPALE
// ─────────────────────────────────────────────────────────────
async function generateAIResponse({ supabase, conversation, client, newMessage }) {

  // Récupère la commande en cours
  const { data: currentOrder } = conversation.current_order_id
    ? await supabase.from('orders').select('*, services(name)').eq('id', conversation.current_order_id).single()
    : { data: null };

  const context = {
    clientName:         client.display_name,
    conversationStatus: conversation.status,
    currentOrder: currentOrder ? {
      service:  currentOrder.services?.name,
      duration: currentOrder.duration_months,
      amount:   currentOrder.amount_fcfa,
      status:   currentOrder.status
    } : null
  };

  const systemPrompt = buildSystemPrompt(context);

  // Historique au format OpenAI (compatible Groq ET Gemini après conversion)
  const history = (conversation.messages || []).slice(-15).map(msg => ({
    role:    msg.role === 'bot' ? 'assistant' : 'user',
    content: msg.content || '[non-texte]'
  }));
  history.push({ role: 'user', content: newMessage });

  // ── TENTATIVE 1 : Groq llama-3.3-70b (principal) ─────────
  try {
    console.log('🧠 Groq llama-3.3-70b...');
    const res = await callGroq('llama-3.3-70b-versatile', systemPrompt, history);

    if (res.ok) {
      const data    = await res.json();
      const rawText = data.choices?.[0]?.message?.content;
      if (rawText) {
        const result = parseResponse(rawText);
        console.log(`✅ Groq OK (${result.responseText.length} chars)`);
        return result;
      }
    }

    if (res.status === 429) {
      console.log('⏳ Groq 429 rate limit → fallback llama-3.1-8b');
    } else {
      console.log(`⚠️ Groq ${res.status} → fallback`);
    }
  } catch (err) {
    console.log(`⚠️ Groq erreur: ${err.message} → fallback`);
  }

  // ── TENTATIVE 2 : Groq llama-3.1-8b-instant (rapide) ─────
  try {
    console.log('🧠 Groq llama-3.1-8b-instant...');
    const res = await callGroq('llama-3.1-8b-instant', systemPrompt, history);

    if (res.ok) {
      const data    = await res.json();
      const rawText = data.choices?.[0]?.message?.content;
      if (rawText) {
        const result = parseResponse(rawText);
        console.log(`✅ Groq 8b OK (${result.responseText.length} chars)`);
        return result;
      }
    }
    console.log(`⚠️ Groq 8b ${res.status} → fallback Gemini`);
  } catch (err) {
    console.log(`⚠️ Groq 8b erreur: ${err.message} → fallback Gemini`);
  }

  // ── TENTATIVE 3 : Gemini 2.0 Flash Lite (dernier recours) ─
  try {
    console.log('🧠 Gemini 2.0-flash-lite (fallback)...');
    const res = await callGemini(systemPrompt, history);

    if (res.ok) {
      const data    = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const result = parseResponse(rawText);
        console.log(`✅ Gemini fallback OK (${result.responseText.length} chars)`);
        return result;
      }
    }
    console.log(`⚠️ Gemini ${res.status}`);
  } catch (err) {
    console.log(`⚠️ Gemini erreur: ${err.message}`);
  }

  // ── Tous les providers ont échoué ────────────────────────
  console.error('❌ Tous les providers IA ont échoué');
  return {
    responseText: "Désolé, je rencontre un souci technique 😅 Notre équipe revient vers toi très vite 💪",
    systemAction: null
  };
}

module.exports = { generateAIResponse };
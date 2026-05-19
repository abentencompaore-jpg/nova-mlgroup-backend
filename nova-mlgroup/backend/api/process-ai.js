// ============================================================
// api/process-ai.js — SOLUTION DÉFINITIVE GEMINI 503
//
// Chaîne de fallback automatique :
//   gemini-2.0-flash-lite (rapide, moins de demande)
//   → gemini-2.0-flash (si lite indispo)
//   → gemini-1.5-flash (dernier recours)
//
// Retries rapides : 300ms + 600ms (pas 1s + 2s)
// Timeout par tentative : 8s max
// ============================================================

const MODELS = [
  'gemini-2.0-flash-lite',  // Rapide, moins de charge
  'gemini-2.0-flash',       // Fallback 1
  'gemini-1.5-flash',       // Fallback 2 (toujours dispo)
];

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildSystemPrompt(context) {
  const now       = new Date();
  const monthNum  = now.getMonth() + 1;
  const monthName = now.toLocaleString('fr-FR', { month: 'long' });
  const hour      = now.getHours();
  const greeting  = hour < 12 ? 'Bonne matinée' : hour < 18 ? 'Bonne après-midi' : 'Bonne soirée';

  const seasonalTip =
    monthNum === 12 || monthNum === 1 ? 'Disney+ (films de fêtes en famille 🎄)' :
    monthNum >= 6 && monthNum <= 8    ? 'Spotify (playlists vacances ☀️)'        :
    monthNum >= 9 && monthNum <= 10   ? 'Canva Pro (projets de rentrée 🎓)'      :
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
💰 CATALOGUE (PRIX FIXES)
━━━━━━━━━━━━━━━━━━━━━
🎬 Netflix 2500F | Prime Video 3500F | Crunchyroll 3000F | Disney+ 5500F | Plex 8500F | Canal 5000F | IPTV 18000F/6mois
🎵 Spotify 3000F | Apple Music 4000F
🎮 PlayStation+ 8000F
✏️ Canva Pro 4000F | CapCut Pro 9500F | iCloud 200Go 3500F
📱 Snapchat+ 10000F/an
🔒 VPN 3000F
🎯 Personnalisé dès 2400F/mois

━━━━━━━━━━━━━━━━━━━━━
🧠 INTELLIGENCE COMMERCIALE
━━━━━━━━━━━━━━━━━━━━━
1. DÉCOUVERTE : Si le client hésite → UNE seule question ouverte pour cerner son profil.
2. RECOMMANDATION : Jamais tout le catalogue. Max 3 services avec justification courte.
3. URGENCE DOUCE : "Netflix est notre service le plus populaire 🔥"
4. OBJECTIONS :
   - "C'est cher" → valeur quotidienne ("Netflix = 83F/jour, moins qu'un café ☕")
   - "Je réfléchis" → "Qu'est-ce qui te fait hésiter ?"
   - "Réduction" → "Les prix sont fixes pour garantir la qualité 😊 Ce sont déjà les meilleurs tarifs du marché !"
5. UPSELL (après livraison) : UN seul service complémentaire. Ce mois de ${monthName} : ${seasonalTip}. Si refus → n'insiste JAMAIS.
6. PRÉNOM : Utilise ${context.clientName ? `"${context.clientName}"` : 'le prénom si tu le connais'} naturellement.

━━━━━━━━━━━━━━━━━━━━━
🔄 FLUX DE VENTE
━━━━━━━━━━━━━━━━━━━━━
[ACCUEIL] Nouveau → message signature. Connu → "Re-bonjour [prénom] ! 😊"
[DÉCOUVERTE] Présente le catalogue par catégories si le client ne sait pas.
[RECOMMANDATION] Propose avec justification. "Pour les séries, Netflix est parfait à 2500F/mois 🎬"
[DEVIS] Confirme service + durée + total. "2 mois Netflix = 5000F CFA ✅ Ça te convient ?"
[RÉCAP] Avant paiement : service, durée, montant total.
[PAIEMENT] "Envoie [MONTANT] F CFA via Orange Money au 📱 ${process.env.OM_PHONE_NUMBER || 'À CONFIGURER'} — Nom : ${process.env.OM_BENEFICIARY_NAME || 'À CONFIGURER'}. Partage le code transaction ou screenshot SMS ✅"
[PREUVE REÇUE] "Reçu ! 👀 Vérification en cours, quelques minutes ⏳" → SYSTEM_ACTION NOTIFY_ADMIN
[POST-LIVRAISON] Upsell contextuel une seule fois.

━━━━━━━━━━━━━━━━━━━━━
⚡ CAS SPÉCIAUX
━━━━━━━━━━━━━━━━━━━━━
LITIGE : "Je comprends ta frustration 🙏 Dis-moi ce qui s'est passé exactement." → ESCALATE_TO_ADMIN si non résolvable.
PERSONNALISÉ : "Super idée ! Notre responsable te recontacte sous 24h pour finaliser ça 😊" → ESCALATE_TO_ADMIN
CRÉDIT : "On ne fait pas les crédits pour le moment, mais dès que tu es prêt je suis là ! 😊"

━━━━━━━━━━━━━━━━━━━━━
🚨 RÈGLES ABSOLUES
━━━━━━━━━━━━━━━━━━━━━
❌ Jamais email/mdp avant validation admin
❌ Jamais négocier les prix
❌ Jamais inventer service ou prix
❌ Jamais divulguer infos d'autres clients
✅ Toujours escalader ce que tu ne peux résoudre seule
✅ Toujours rester chaleureuse

━━━━━━━━━━━━━━━━━━━━━
📌 CONTEXTE
━━━━━━━━━━━━━━━━━━━━━
Client : ${context.clientName || 'Nouveau'}
Statut : ${context.conversationStatus}
Commande : ${context.currentOrder ? `${context.currentOrder.service} — ${context.currentOrder.duration}mois — ${context.currentOrder.amount}F (${context.currentOrder.status})` : 'Aucune'}
Heure : ${now.toLocaleString('fr-FR')} (${greeting})

━━━━━━━━━━━━━━━━━━━━━
⚙️ ACTIONS SYSTÈME (invisible client, nouvelle ligne à la fin)
━━━━━━━━━━━━━━━━━━━━━
SYSTEM_ACTION: {"type":"NEW_ORDER","service":"Netflix","duration":1,"amount":2500}
SYSTEM_ACTION: {"type":"NOTIFY_ADMIN","data":{}}
SYSTEM_ACTION: {"type":"ESCALATE_TO_ADMIN","reason":"litige"}`.trim();
}

// ──────────────────────────────────────────────────────────────
// Appel Gemini avec timeout par requête et chaîne de fallback
// ──────────────────────────────────────────────────────────────
async function callGeminiWithTimeout(modelName, requestBody, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${BASE_URL}/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
        signal:  controller.signal
      }
    );
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function generateAIResponse({ supabase, conversation, client, newMessage }) {

  // ── Requêtes parallèles ──────────────────────────────────
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

  // ── Historique (15 messages) ─────────────────────────────
  const history = (conversation.messages || []).slice(-15).map(msg => ({
    role:  msg.role === 'bot' ? 'model' : 'user',
    parts: [{ text: msg.content || '[non-texte]' }]
  }));
  history.push({ role: 'user', parts: [{ text: newMessage }] });

  const requestBody = {
    system_instruction: { parts: [{ text: buildSystemPrompt(context) }] },
    contents: history,
    generationConfig: {
      temperature:     0.75,
      maxOutputTokens: 512,
      topK:            40,
      topP:            0.95,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',  threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  // ── Chaîne de fallback entre modèles ─────────────────────
  for (const modelName of MODELS) {
    let attempt = 0;
    const maxAttempts = modelName === MODELS[0] ? 2 : 1; // Plus de tentatives sur le modèle principal

    while (attempt < maxAttempts) {
      try {
        console.log(`🧠 Essai avec ${modelName} (tentative ${attempt + 1})...`);

        const response = await callGeminiWithTimeout(modelName, requestBody, 8000);

        if (response.status === 503 || response.status === 429) {
          const waitMs = attempt === 0 ? 300 : 600; // Retries rapides : 300ms + 600ms
          console.log(`⏳ ${modelName} ${response.status}, retry dans ${waitMs}ms`);
          await new Promise(r => setTimeout(r, waitMs));
          attempt++;
          continue;
        }

        if (!response.ok) {
          const err = await response.json();
          throw new Error(`Gemini ${response.status}: ${JSON.stringify(err)}`);
        }

        const data    = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Réponse vide');

        // ── Parser SYSTEM_ACTION ──────────────────────────
        const actionMatch = rawText.match(/\nSYSTEM_ACTION:\s*(\{[^}]+\})/);
        let responseText  = rawText;
        let systemAction  = null;

        if (actionMatch) {
          try {
            systemAction = JSON.parse(actionMatch[1]);
            responseText = rawText.replace(/\nSYSTEM_ACTION:[\s\S]*$/, '').trim();
          } catch {
            responseText = rawText.replace(/\nSYSTEM_ACTION:[\s\S]*$/, '').trim();
          }
        }

        console.log(`✅ ${modelName} OK (${responseText.length} chars)${systemAction ? ` + ${systemAction.type}` : ''}`);
        return { responseText, systemAction };

      } catch (error) {
        console.error(`❌ ${modelName} tentative ${attempt + 1}: ${error.message}`);
        attempt++;
      }
    }

    console.log(`⏭️ Passage au modèle suivant...`);
  }

  // Tous les modèles ont échoué
  console.error('❌ Tous les modèles Gemini ont échoué');
  return {
    responseText: "Désolé, je rencontre un souci technique 😅 Notre équipe revient vers toi très vite 💪",
    systemAction: null
  };
}

module.exports = { generateAIResponse };
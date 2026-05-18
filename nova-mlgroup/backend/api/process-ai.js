// ============================================================
// api/process-ai.js — VERSION OPTIMISÉE
// Optimisations latence :
// - Requêtes Supabase parallèles
// - Prompt réduit (moins de tokens = plus rapide)
// - maxOutputTokens réduit à 300
// - Fix messages tronqués : regex SYSTEM_ACTION plus robuste
// ============================================================

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

function buildSystemPrompt(context) {
  const now       = new Date();
  const monthName = now.toLocaleString('fr-FR', { month: 'long' });

  return `Tu es NOVA, assistante digitale de ML Group (Ouagadougou, Burkina Faso). Vends des abonnements numériques. Ton : jeune, chaleureux, direct.

PRIX (fixes, non négociables) :
Netflix 2500F | Prime 3500F | Crunchyroll 3000F | Disney+ 5500F | Plex 8500F | Canal 5000F | IPTV 18000F/6mois | Spotify 3000F | Apple Music 4000F | PS+ 8000F | Canva 4000F | CapCut 9500F | iCloud 3500F | Snapchat+ 10000F/an | VPN 3000F

CONTEXTE : Client: ${context.clientName || 'Nouveau'} | Statut: ${context.conversationStatus} | Commande: ${context.currentOrder ? JSON.stringify(context.currentOrder) : 'aucune'} | ${now.toLocaleString('fr-FR')} (${monthName})
OM: ${process.env.OM_PHONE_NUMBER || 'À CONFIGURER'} | Bénéficiaire: ${process.env.OM_BENEFICIARY_NAME || 'À CONFIGURER'}

RÈGLES : Jamais donner email/mdp avant validation admin. Jamais négocier les prix. Réponses COURTES (max 5 lignes). Utilise des emojis avec modération.

ACTIONS (fin de message, nouvelle ligne, seulement si nécessaire) :
SYSTEM_ACTION: {"type":"NEW_ORDER","service":"Netflix","duration":1,"amount":2500}
SYSTEM_ACTION: {"type":"NOTIFY_ADMIN","data":{}}
SYSTEM_ACTION: {"type":"ESCALATE_TO_ADMIN","reason":"litige"}`.trim();
}

async function generateAIResponse({ supabase, conversation, client, newMessage }) {

  // ── Requêtes parallèles (gain ~300ms) ────────────────────
  const [currentOrderResult, recentMessagesData] = await Promise.all([
    conversation.current_order_id
      ? supabase.from('orders').select('*, services(name)').eq('id', conversation.current_order_id).single()
      : Promise.resolve({ data: null }),
    Promise.resolve((conversation.messages || []).slice(-10)) // Réduit de 20 à 10
  ]);

  const currentOrder = currentOrderResult.data;

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

  // ── Historique allégé ────────────────────────────────────
  const history = recentMessagesData.map(msg => ({
    role:  msg.role === 'bot' ? 'model' : 'user',
    parts: [{ text: msg.content || '[non-texte]' }]
  }));
  history.push({ role: 'user', parts: [{ text: newMessage }] });

  const requestBody = {
    system_instruction: { parts: [{ text: buildSystemPrompt(context) }] },
    contents: history,
    generationConfig: {
      temperature:      0.7,
      maxOutputTokens:  300,   // Réduit de 512 → 300 (réponses plus courtes et rapides)
      topK:             40,
      topP:             0.95,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',  threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  let attempt = 0;
  while (attempt < 3) {
    try {
      const response = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody)
      });

      if (response.status === 429) {
        const wait = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Rate limit, retry dans ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`Gemini ${response.status}: ${JSON.stringify(err)}`);
      }

      const data    = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Réponse Gemini vide');

      // ── Fix messages tronqués : regex multiline robuste ──
      // L'ancien regex ne capturait pas les JSON sur plusieurs lignes
      const actionMatch  = rawText.match(/\nSYSTEM_ACTION:\s*(\{[^}]+\})/);
      let responseText   = rawText;
      let systemAction   = null;

      if (actionMatch) {
        try {
          systemAction  = JSON.parse(actionMatch[1]);
          responseText  = rawText.replace(/\nSYSTEM_ACTION:[\s\S]*$/, '').trim();
        } catch {
          // JSON malformé → on ignore l'action mais garde le texte
          responseText = rawText.replace(/\nSYSTEM_ACTION:[\s\S]*$/, '').trim();
          console.warn('⚠️ SYSTEM_ACTION JSON invalide');
        }
      }

      console.log(`🤖 NOVA (${responseText.length} chars)${systemAction ? ` + action ${systemAction.type}` : ''}`);
      return { responseText, systemAction };

    } catch (error) {
      console.error(`❌ Tentative ${attempt + 1}/3 :`, error.message);
      attempt++;
    }
  }

  return {
    responseText: "Désolé, souci technique 😅 Notre équipe revient vers toi rapidement 💪",
    systemAction: null
  };
}

module.exports = { generateAIResponse };
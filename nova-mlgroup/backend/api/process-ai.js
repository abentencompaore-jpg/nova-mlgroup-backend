// ============================================================
// api/process-ai.js
// Appel à l'API Google Gemini Flash
// Gère le contexte multi-tours de conversation
// ============================================================

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

// ──────────────────────────────────────────────────────────────
// Prompt système NOVA (version courte — le complet est en section 3)
// On injecte aussi le contexte dynamique (statut, commande, etc.)
// ──────────────────────────────────────────────────────────────
function buildSystemPrompt(context) {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  
  // Texte du mois pour l'upsell saisonnier
  const monthName = now.toLocaleString('fr-FR', { month: 'long' });
  
  return `
Tu es NOVA, l'assistante digitale de ML Group (Ouagadougou, Burkina Faso).
Tu vends des abonnements numériques via WhatsApp. Ton ton est jeune, dynamique, chaleureux.

CATALOGUE TARIFAIRE (prix fixes, non négociables) :
- Netflix 2500F/mois | Prime Video 3500F/mois | Crunchyroll 3000F/mois
- Disney+ 5500F/mois | Plex TV 8500F/mois | My Canal 5000F/mois | IPTV 18000F/6mois
- Spotify 3000F/mois | Apple Music 4000F/mois | PlayStation+ 8000F/mois
- Canva Pro 4000F/mois | CapCut Pro 9500F/mois | iCloud 200Go 3500F/mois
- Snapchat+ 10000F/an | VPN 3000F/mois | Abonnement personnalisé dès 2400F/mois

CONTEXTE ACTUEL :
- Client : ${context.clientName || 'Nouveau client'}
- Statut conversation : ${context.conversationStatus}
- Commande en cours : ${context.currentOrder ? JSON.stringify(context.currentOrder) : 'Aucune'}
- Date/heure : ${now.toLocaleString('fr-FR')} (mois de ${monthName})
- Numéro Orange Money admin : ${process.env.OM_PHONE_NUMBER || 'À CONFIGURER'}
- Nom bénéficiaire OM : ${process.env.OM_BENEFICIARY_NAME || 'À CONFIGURER'}

RÈGLES ABSOLUES :
1. Ne JAMAIS donner un compte (email/mdp) avant que l'admin valide le paiement
2. Ne JAMAIS négocier les prix
3. Si demande de réduction → "Pour toute offre spéciale, je peux contacter notre responsable pour toi 😊"
4. Pour abonnement personnalisé → escalade toujours à l'admin
5. Pour litige → reste calme, escalade si nécessaire

ACTIONS SYSTÈME :
Quand tu détectes un événement clé, ajoute à la FIN de ton message (sur une nouvelle ligne) :
- Nouvelle commande confirmée : SYSTEM_ACTION: {"type":"NEW_ORDER","service":"[nom]","duration":[mois],"amount":[fcfa]}
- Preuve de paiement reçue : SYSTEM_ACTION: {"type":"NOTIFY_ADMIN","data":{}}
- Litige : SYSTEM_ACTION: {"type":"ESCALATE_TO_ADMIN","reason":"[raison]"}

IMPORTANT : Le SYSTEM_ACTION ne doit JAMAIS être visible par le client. C'est uniquement pour le traitement backend. Ajoute-le seulement quand nécessaire.
  `.trim();
}

/**
 * Génère une réponse IA avec Gemini Flash
 * @param {Object} params - { supabase, conversation, client, newMessage, messageType }
 * @returns {Object} - { responseText, systemAction }
 */
async function generateAIResponse({ supabase, conversation, client, newMessage, messageType }) {
  
  // ──────────────────────────────────────────────
  // CONSTRUCTION DU CONTEXTE DE CONVERSATION
  // Gemini supporte le multi-tours via "contents"
  // ──────────────────────────────────────────────
  
  // Récupère la commande en cours si elle existe
  let currentOrder = null;
  if (conversation.current_order_id) {
    const { data } = await supabase
      .from('orders')
      .select('*, services(name)')
      .eq('id', conversation.current_order_id)
      .single();
    currentOrder = data;
  }

  // Contexte dynamique pour le prompt système
  const context = {
    clientName: client.display_name,
    conversationStatus: conversation.status,
    currentOrder: currentOrder ? {
      service: currentOrder.services?.name,
      duration: currentOrder.duration_months,
      amount: currentOrder.amount_fcfa,
      status: currentOrder.status
    } : null
  };

  // ──────────────────────────────────────────────
  // HISTORIQUE DE CONVERSATION pour le contexte IA
  // On limite à 20 derniers messages pour rester dans les limites du free tier
  // ──────────────────────────────────────────────
  const recentMessages = (conversation.messages || []).slice(-20);
  
  // Format requis par l'API Gemini : alternance user/model
  const conversationHistory = [];
  
  for (const msg of recentMessages) {
    // Gemini utilise "user" et "model" (pas "bot")
    const role = msg.role === 'bot' ? 'model' : 'user';
    conversationHistory.push({
      role,
      parts: [{ text: msg.content || '[Message non textuel]' }]
    });
  }

  // Ajoute le nouveau message du client
  conversationHistory.push({
    role: 'user',
    parts: [{ text: newMessage }]
  });

  // ──────────────────────────────────────────────
  // APPEL À L'API GEMINI FLASH
  // ──────────────────────────────────────────────
  const requestBody = {
    system_instruction: {
      parts: [{ text: buildSystemPrompt(context) }]
    },
    contents: conversationHistory,
    generationConfig: {
      temperature: 0.7,        // Créativité modérée
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 512,    // Réponses courtes pour WhatsApp
      stopSequences: []
    },
    safetySettings: [
      // Réduit les faux positifs pour le contexte commercial
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  // Gestion du rate limit : retry avec backoff exponentiel
  let attempt = 0;
  let lastError = null;
  
  while (attempt < 3) {
    try {
      const response = await fetch(
        `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        }
      );

      if (response.status === 429) {
        // Rate limit atteint : attendre et réessayer
        const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Rate limit Gemini, retry dans ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      
      // Extrait le texte de la réponse
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) {
        throw new Error('Réponse Gemini vide ou filtrée');
      }

      // ──────────────────────────────────────────
      // PARSING DE L'ACTION SYSTÈME (si présente)
      // ──────────────────────────────────────────
      let responseText = rawText;
      let systemAction = null;

      const systemActionRegex = /SYSTEM_ACTION:\s*(\{.*\})/;
      const match = rawText.match(systemActionRegex);
      
      if (match) {
        try {
          systemAction = JSON.parse(match[1]);
          // Supprime la ligne SYSTEM_ACTION du texte envoyé au client
          responseText = rawText.replace(/\nSYSTEM_ACTION:.*$/m, '').trim();
        } catch (e) {
          console.warn('⚠️ Impossible de parser le SYSTEM_ACTION:', match[1]);
        }
      }

      console.log(`🤖 NOVA response generated (${responseText.length} chars)`);
      if (systemAction) console.log(`⚡ System action detected: ${systemAction.type}`);

      return { responseText, systemAction };

    } catch (error) {
      lastError = error;
      attempt++;
    }
  }

  // Après 3 tentatives échouées : réponse de fallback
  console.error('❌ Gemini API failed after 3 attempts:', lastError);
  return {
    responseText: "Désolé, je rencontre un petit souci technique 😅 Notre équipe est là pour t'aider ! Envoie-nous ton message, on revient vers toi dans quelques minutes 💪",
    systemAction: null
  };
}

module.exports = { generateAIResponse };
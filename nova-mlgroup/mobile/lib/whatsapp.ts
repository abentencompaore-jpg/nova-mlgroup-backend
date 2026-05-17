// ============================================================
// mobile/lib/whatsapp.ts — VERSION CORRIGÉE
// Correction : ajout de sendManualRenewalMessage
//              (manquait → erreur dans renewals.tsx)
// ============================================================

import { supabase } from './supabase';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

// ── Helper : récupère les headers d'auth ───────────────────
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Non authentifié');
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

// ── Valider ou rejeter un paiement ─────────────────────────
export async function validatePayment(
  orderId:         string,
  action:          'validate' | 'reject',
  rejectionReason?: string
) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/validate-payment`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ orderId, action, rejectionReason }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Livrer un compte après validation ──────────────────────
export async function deliverAccount(orderId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/deliver-account`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ orderId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Envoyer une relance manuelle de renouvellement ─────────
// ✅ CORRECTION : cette fonction manquait → erreur dans renewals.tsx
export async function sendManualRenewalMessage(
  phone:   string,
  message: string,
  orderId: string
): Promise<void> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${BACKEND_URL}/api/send-renewal`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ phone, message, orderId }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erreur envoi relance : ${err}`);
  }

  // Met à jour reminder_sent dans Supabase
  await supabase
    .from('orders')
    .update({
      reminder_sent:    true,
      reminder_sent_at: new Date().toISOString(),
    })
    .eq('id', orderId);
}

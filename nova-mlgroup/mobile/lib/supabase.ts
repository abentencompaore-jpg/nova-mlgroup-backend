// ============================================================
// mobile/lib/supabase.ts — VERSION CORRIGÉE v2
// Corrections :
//  - Types explicites pour les paramètres de .sort()
//  - Import AsyncStorage avec vérification
// ============================================================

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import type { TreasurySummary } from '../types';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:            AsyncStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

// ── Auth ────────────────────────────────────────────────────
export const signInAdmin = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

export const signOut = () => supabase.auth.signOut();

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// ── Conversations ───────────────────────────────────────────
export async function fetchConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      clients(whatsapp_phone, display_name, total_orders),
      orders!current_order_id(id, status, amount_fcfa, services(name))
    `)
    .order('last_message_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function subscribeToConversations(
  callback: (data: Awaited<ReturnType<typeof fetchConversations>>) => void
) {
  const channel = supabase
    .channel('conversations-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, async () => {
      const conversations = await fetchConversations();
      callback(conversations);
    })
    .subscribe();

  // ✅ Retourne une fonction SYNCHRONE (pas de Promise)
  return () => { supabase.removeChannel(channel); };
}

export async function takeoverConversation(id: string) {
  const { error } = await supabase.from('conversations').update({ is_admin_takeover: true }).eq('id', id);
  if (error) throw error;
}

export async function releaseConversation(id: string) {
  const { error } = await supabase.from('conversations').update({ is_admin_takeover: false }).eq('id', id);
  if (error) throw error;
}

export async function resolveConversation(id: string) {
  const { error } = await supabase.from('conversations').update({ status: 'delivered' }).eq('id', id);
  if (error) throw error;
}

// ── Stock ───────────────────────────────────────────────────
export async function fetchAccounts(serviceId?: string) {
  let query = supabase
    .from('accounts')
    .select('*, services(name, category), clients(whatsapp_phone, display_name)')
    .order('created_at', { ascending: false });
  if (serviceId) query = query.eq('service_id', serviceId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function deleteAccount(accountId: string) {
  const { error } = await supabase.from('accounts').delete().eq('id', accountId).eq('status', 'available');
  if (error) throw error;
}

export async function getStockCounts() {
  const { data, error } = await supabase
    .from('accounts').select('service_id, status, services(name)').eq('status', 'available');
  if (error) throw error;

  const counts: Record<string, { name: string; count: number }> = {};
  for (const account of (data ?? [])) {
    const sid = account.service_id;
    if (!counts[sid]) counts[sid] = { name: (account as any).services?.name ?? 'Inconnu', count: 0 };
    counts[sid].count++;
  }
  return Object.values(counts).map(s => ({ service_name: s.name, count: s.count, is_low: s.count < 3 }));
}

// ── Trésorerie ──────────────────────────────────────────────
export async function fetchTreasuryStats(period: 'today' | 'week' | 'month' | 'year' | 'all') {
  const now = new Date();
  let startDate: Date | null = null;
  switch (period) {
    case 'today': startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case 'week':  startDate = new Date(now.getTime() - 7 * 86400000); break;
    case 'month': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'year':  startDate = new Date(now.getFullYear(), 0, 1); break;
  }

  let query = supabase.from('orders').select('amount_fcfa, created_at, services(name)')
    .in('status', ['validated', 'delivered']);
  if (startDate) query = query.gte('created_at', startDate.toISOString());

  const { data: orders, error } = await query;
  if (error) throw error;

  const totalRevenue = (orders ?? []).reduce((sum: number, o: { amount_fcfa: number }) => sum + o.amount_fcfa, 0);

  // ✅ CORRECTION : types explicites sur les paramètres de sort
  const byService: Record<string, TreasurySummary> = {};
  for (const order of (orders ?? [])) {
    const name = (order as any).services?.name ?? 'Inconnu';
    if (!byService[name]) byService[name] = { service_name: name, revenue: 0, count: 0 };
    byService[name].revenue += order.amount_fcfa;
    byService[name].count++;
  }

  // ✅ Types explicites → fin de l'erreur "paramètre 's' implicitement any"
  const summaryByService: TreasurySummary[] = Object.values(byService)
    .sort((a: TreasurySummary, b: TreasurySummary) => b.revenue - a.revenue);

  const byDay: Record<string, number> = {};
  for (const order of (orders ?? [])) {
    const day = (order.created_at as string).split('T')[0];
    byDay[day] = (byDay[day] ?? 0) + order.amount_fcfa;
  }

  const revenueByDay = Object.entries(byDay)
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));

  return { totalRevenue, summaryByService, revenueByDay };
}

// ── Abonnements expirants ───────────────────────────────────
export async function fetchExpiringSubscriptions() {
  const { data, error } = await supabase
    .from('expiring_subscriptions')
    .select('*')
    .neq('urgency_level', 'ok')
    .order('days_remaining', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
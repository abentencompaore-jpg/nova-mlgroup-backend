// ============================================================
// mobile/app/(tabs)/renewals.tsx — VERSION CORRIGÉE
// Corrections :
//  - StyleSheet : 'inset' → top/bottom/left/right (non supporté RN)
//  - Import sendManualRenewalMessage depuis whatsapp.ts corrigé
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, SafeAreaView, ActivityIndicator, ScrollView
} from 'react-native';
import { supabase, fetchExpiringSubscriptions } from '../../lib/supabase';
import { sendManualRenewalMessage } from '../../lib/whatsapp';

type UrgencyLevel = 'expired' | 'critical' | 'warning' | 'notice' | 'ok';

interface ExpiringSubscription {
  order_id:         string;
  expires_at:       string;
  amount_fcfa:      number;
  duration_months:  number;
  reminder_sent:    boolean;
  reminder_sent_at: string | null;
  service_name:     string;
  category:         string;
  client_id:        string;
  whatsapp_phone:   string;
  display_name:     string | null;
  total_orders:     number;
  days_remaining:   number;
  urgency_level:    UrgencyLevel;
}

const URGENCY_CONFIG: Record<UrgencyLevel, {
  color: string; bg: string; label: string; emoji: string;
}> = {
  expired:  { color: '#ef4444', bg: '#7f1d1d', label: 'Expiré',        emoji: '🔴' },
  critical: { color: '#f97316', bg: '#7c2d12', label: 'Expire bientôt', emoji: '🟠' },
  warning:  { color: '#eab308', bg: '#713f12', label: 'Cette semaine',  emoji: '🟡' },
  notice:   { color: '#3b82f6', bg: '#1e3a5f', label: '15 jours',       emoji: '🔵' },
  ok:       { color: '#22c55e', bg: '#14532d', label: 'Actif',          emoji: '🟢' },
};

function buildRenewalMessage(sub: ExpiringSubscription): string {
  const name    = sub.display_name || 'là';
  const service = sub.service_name;
  const price   = sub.amount_fcfa.toLocaleString('fr-FR');
  const expDate = new Date(sub.expires_at).toLocaleDateString('fr-FR');
  const isLoyal = sub.total_orders >= 3;

  if (sub.urgency_level === 'expired') {
    return (
      `Salut ${name} ! 👋\n` +
      `Ton abonnement *${service}* a expiré le ${expDate} ⚠️\n\n` +
      `On peut le renouveler tout de suite !\n` +
      `C'est *${price} F CFA / mois* 😊\n` +
      `Tu veux qu'on s'en occupe ? 🚀`
    );
  }

  const days = sub.days_remaining;
  return (
    `Salut ${name} ! 👋\n` +
    `Ton abonnement *${service}* expire dans ${days} jour${days > 1 ? 's' : ''} ⏰\n` +
    `(Le ${expDate})\n\n` +
    (isLoyal ? `Merci pour ta fidélité — ${sub.total_orders} commandes avec nous ! 🙏\n` : '') +
    `Tu veux le renouveler ? C'est *${price} F CFA / mois* 🚀\n` +
    `Réponds-moi et on s'en occupe de suite 😊`
  );
}

// ── Carte abonnement ────────────────────────────────────────
function RenewalCard({
  sub,
  onSendReminder,
}: {
  sub: ExpiringSubscription;
  onSendReminder: (sub: ExpiringSubscription) => void;
}) {
  const config   = URGENCY_CONFIG[sub.urgency_level];
  const daysText =
    sub.days_remaining < 0
      ? `Expiré il y a ${Math.abs(sub.days_remaining)} jour(s)`
      : sub.days_remaining === 0
      ? "Expire aujourd'hui !"
      : `Expire dans ${sub.days_remaining} jour(s)`;

  return (
    <View style={[styles.card, { borderLeftColor: config.color }]}>
      <View style={styles.cardHeader}>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName}>{sub.service_name}</Text>
          <View style={[styles.urgencyBadge, { backgroundColor: config.bg }]}>
            <Text style={[styles.urgencyText, { color: config.color }]}>
              {config.emoji} {config.label}
            </Text>
          </View>
        </View>
        <Text style={[styles.daysText, { color: config.color }]}>{daysText}</Text>
      </View>

      <Text style={styles.clientName}>
        👤 {sub.display_name || sub.whatsapp_phone}
        {sub.total_orders >= 3 ? ' ⭐' : ''}
      </Text>
      <Text style={styles.clientPhone}>{sub.whatsapp_phone}</Text>

      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>📅 {new Date(sub.expires_at).toLocaleDateString('fr-FR')}</Text>
        <Text style={styles.metaText}>💰 {sub.amount_fcfa.toLocaleString('fr-FR')} F</Text>
        <Text style={styles.metaText}>🔄 {sub.duration_months} mois</Text>
      </View>

      {sub.reminder_sent && sub.reminder_sent_at && (
        <View style={styles.autoReminderBadge}>
          <Text style={styles.autoReminderText}>
            ✅ Rappel auto envoyé le {new Date(sub.reminder_sent_at).toLocaleDateString('fr-FR')}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.reminderBtn, { backgroundColor: config.color + '22', borderColor: config.color }]}
        onPress={() => onSendReminder(sub)}
      >
        <Text style={[styles.reminderBtnText, { color: config.color }]}>
          📤 Envoyer une relance WhatsApp
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Page principale ─────────────────────────────────────────
export default function RenewalsScreen() {
  const [subscriptions, setSubscriptions] = useState<ExpiringSubscription[]>([]);
  const [filtered, setFiltered]           = useState<ExpiringSubscription[]>([]);
  const [activeFilter, setActiveFilter]   = useState<UrgencyLevel | 'all'>('all');
  const [isLoading, setIsLoading]         = useState(true);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const [preview, setPreview]             = useState<{ sub: ExpiringSubscription; text: string } | null>(null);

  const applyFilter = useCallback(
    (data: ExpiringSubscription[], filter: UrgencyLevel | 'all') => {
      setFiltered(filter === 'all' ? data : data.filter(s => s.urgency_level === filter));
      setActiveFilter(filter);
    },
    []
  );

  const loadData = useCallback(async () => {
    try {
      const data = await fetchExpiringSubscriptions() as ExpiringSubscription[];
      setSubscriptions(data);
      applyFilter(data, activeFilter);
    } catch (err: unknown) {
      Alert.alert('Erreur', String(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeFilter, applyFilter]);

  useEffect(() => { loadData(); }, []);

  // Supabase Realtime — cleanup synchrone (fix useEffect)
  useEffect(() => {
    const channel = supabase
      .channel('orders-expiry')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      // ✅ Synchrone — pas de Promise dans le return
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const handleSendReminder = (sub: ExpiringSubscription) => {
    setPreview({ sub, text: buildRenewalMessage(sub) });
  };

  const confirmSend = async () => {
    if (!preview) return;
    const { sub, text } = preview;
    setPreview(null);
    try {
      await sendManualRenewalMessage(sub.whatsapp_phone, text, sub.order_id);
      Alert.alert('✅ Envoyé !', `Relance envoyée à ${sub.display_name || sub.whatsapp_phone}`);
      loadData();
    } catch (err: unknown) {
      Alert.alert('Erreur', String(err));
    }
  };

  const counts = {
    all:      subscriptions.length,
    expired:  subscriptions.filter(s => s.urgency_level === 'expired').length,
    critical: subscriptions.filter(s => s.urgency_level === 'critical').length,
    warning:  subscriptions.filter(s => s.urgency_level === 'warning').length,
    notice:   subscriptions.filter(s => s.urgency_level === 'notice').length,
  };

  const potentialRevenue = filtered.reduce((s, x) => s + x.amount_fcfa, 0);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>

      {/* Filtres */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
        {([
          { key: 'all'      as const, label: 'Tous',     count: counts.all },
          { key: 'expired'  as const, label: 'Expirés',  count: counts.expired },
          { key: 'critical' as const, label: '3 jours',  count: counts.critical },
          { key: 'warning'  as const, label: 'Semaine',  count: counts.warning },
          { key: 'notice'   as const, label: '15 jours', count: counts.notice },
        ]).map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
            onPress={() => applyFilter(subscriptions, f.key)}
          >
            <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
            {f.count > 0 && (
              <View style={[styles.filterCount, f.key === 'expired' && { backgroundColor: '#ef4444' }]}>
                <Text style={styles.filterCountText}>{f.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bannière revenu */}
      {filtered.length > 0 && (
        <View style={styles.revenueBanner}>
          <Text style={styles.revenueLabel}>💡 Revenu potentiel à récupérer</Text>
          <Text style={styles.revenueAmount}>{potentialRevenue.toLocaleString('fr-FR')} F CFA</Text>
          <Text style={styles.revenueCount}>sur {filtered.length} abonnement(s)</Text>
        </View>
      )}

      {/* Liste */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.order_id}
        renderItem={({ item }) => (
          <RenewalCard sub={item} onSendReminder={handleSendReminder} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { setIsRefreshing(true); loadData(); }}
            colors={['#f97316']}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🎉</Text>
            <Text style={styles.emptyText}>Aucun abonnement expirant</Text>
            <Text style={styles.emptySubtext}>Tous tes clients sont à jour !</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />

      {/* Modal aperçu */}
      {preview && (
        <View style={styles.previewOverlay}>
          <View style={styles.previewModal}>
            <Text style={styles.previewTitle}>📝 Aperçu du message</Text>
            <Text style={styles.previewRecipient}>
              → {preview.sub.display_name || preview.sub.whatsapp_phone}
            </Text>
            <View style={styles.previewBubble}>
              <Text style={styles.previewText}>{preview.text}</Text>
            </View>
            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPreview(null)}>
                <Text style={styles.cancelBtnText}>✕ Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendBtn} onPress={confirmSend}>
                <Text style={styles.sendBtnText}>📤 Envoyer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0f172a' },
  loading:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },

  filterBar:        { paddingHorizontal: 12, paddingVertical: 10, maxHeight: 56 },
  filterChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#1e293b', marginRight: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterChipActive: { backgroundColor: '#f97316' },
  filterText:       { color: '#64748b', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  filterCount:      { backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  filterCountText:  { color: '#fff', fontSize: 10, fontWeight: '800' },

  revenueBanner: { margin: 12, backgroundColor: '#1c1917', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f97316', alignItems: 'center' },
  revenueLabel:  { color: '#94a3b8', fontSize: 11, marginBottom: 2 },
  revenueAmount: { color: '#f97316', fontSize: 26, fontWeight: '800' },
  revenueCount:  { color: '#78716c', fontSize: 11 },

  list:          { paddingBottom: 20 },
  card:          { backgroundColor: '#1e293b', marginHorizontal: 12, marginVertical: 5, borderRadius: 14, padding: 14, borderLeftWidth: 4 },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  serviceInfo:   { flex: 1, gap: 4 },
  serviceName:   { color: '#f1f5f9', fontWeight: '700', fontSize: 16 },
  urgencyBadge:  { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  urgencyText:   { fontSize: 10, fontWeight: '700' },
  daysText:      { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  clientName:    { color: '#cbd5e1', fontSize: 14, fontWeight: '600', marginTop: 4 },
  clientPhone:   { color: '#64748b', fontSize: 12, marginBottom: 8 },
  cardMeta:      { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 8 },
  metaText:      { color: '#94a3b8', fontSize: 11 },
  autoReminderBadge: { backgroundColor: '#14532d', borderRadius: 8, padding: 6, marginBottom: 8 },
  autoReminderText:  { color: '#4ade80', fontSize: 11 },
  reminderBtn:    { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  reminderBtnText:{ fontWeight: '700', fontSize: 13 },

  empty:        { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji:   { fontSize: 48 },
  emptyText:    { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },
  emptySubtext: { color: '#475569', fontSize: 13 },

  // ✅ CORRECTION : inset remplacé par top/bottom/left/right
  previewOverlay: {
    position:        'absolute',
    top:             0,
    bottom:          0,
    left:            0,
    right:           0,
    backgroundColor: '#000000aa',
    justifyContent:  'flex-end',
  },
  previewModal:   { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  previewTitle:   { color: '#f1f5f9', fontSize: 17, fontWeight: '700' },
  previewRecipient: { color: '#64748b', fontSize: 13 },
  previewBubble:  { backgroundColor: '#0f172a', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#334155' },
  previewText:    { color: '#e2e8f0', fontSize: 14, lineHeight: 21 },
  previewActions: { flexDirection: 'row', gap: 10 },
  cancelBtn:      { flex: 1, backgroundColor: '#334155', borderRadius: 12, padding: 13, alignItems: 'center' },
  cancelBtnText:  { color: '#94a3b8', fontWeight: '700' },
  sendBtn:        { flex: 1, backgroundColor: '#f97316', borderRadius: 12, padding: 13, alignItems: 'center' },
  sendBtnText:    { color: '#fff', fontWeight: '700' },
});

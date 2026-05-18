// ============================================================
// mobile/app/(tabs)/support.tsx — Liquid Glass
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet as RNStyleSheet, RefreshControl,
  Alert, ActivityIndicator, SafeAreaView, ScrollView, Animated
} from 'react-native';
import {
  fetchConversations, subscribeToConversations,
  takeoverConversation, releaseConversation, resolveConversation,
} from '../../lib/supabase';
import { Colors, Glass, STATUS_META, Typography, Spacing } from '../../lib/theme';
import type { Conversation } from '../../types';

// ── Carte conversation ───────────────────────────────────────
function ConvCard({ conv, onPress }: { conv: Conversation; onPress: () => void }) {
  const meta        = STATUS_META[conv.status as keyof typeof STATUS_META] ?? STATUS_META.new;
  const messages    = conv.messages ?? [];
  const lastText    = messages[messages.length - 1]?.content?.slice(0, 52) ?? 'Nouvelle conversation';
  const name        = conv.clients?.display_name ?? conv.clients?.whatsapp_phone ?? 'Client';
  const time        = conv.last_message_at
    ? new Date(conv.last_message_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';
  const isBot       = !conv.is_admin_takeover;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={cardStyles.wrap}>
      <View style={[cardStyles.card, { borderColor: meta.color + '20' }]}>

        {/* Barre de statut gauche */}
        <View style={[cardStyles.bar, { backgroundColor: meta.color }]} />

        <View style={cardStyles.content}>
          {/* Ligne nom + heure */}
          <View style={cardStyles.row}>
            <Text style={cardStyles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={cardStyles.time}>{time}</Text>
          </View>

          {/* Aperçu message */}
          <Text style={cardStyles.preview} numberOfLines={1}>{lastText}</Text>

          {/* Badges */}
          <View style={cardStyles.badges}>
            <View style={[cardStyles.badge, { backgroundColor: meta.bg }]}>
              <View style={[cardStyles.badgeDot, { backgroundColor: meta.color }]} />
              <Text style={[cardStyles.badgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <View style={[cardStyles.badge, { backgroundColor: Colors.glass05 }]}>
              <Text style={[cardStyles.badgeText, { color: Colors.textMuted }]}>
                {isBot ? 'NOVA' : 'Admin'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const cardStyles = RNStyleSheet.create({
  wrap:    { paddingHorizontal: 16, marginBottom: 8 },
  card: {
    ...Glass.card,
    flexDirection: 'row',
    overflow:      'hidden',
    borderWidth:   1,
  },
  bar:     { width: 3, borderRadius: 2 },
  content: { flex: 1, padding: 14, gap: 5 },
  row:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:    { ...Typography.h3, fontSize: 15, flex: 1 },
  time:    { ...Typography.micro, color: Colors.textMuted },
  preview: { ...Typography.caption, color: Colors.textSecondary, lineHeight: 18 },
  badges:  { flexDirection: 'row', gap: 6, marginTop: 2 },
  badge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 50 },
  badgeDot:{ width: 4, height: 4, borderRadius: 2 },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
});

// ── Page Support ─────────────────────────────────────────────
export function SupportScreen() {
  const [convs, setConvs]           = useState<Conversation[]>([]);
  const [filtered, setFiltered]     = useState<Conversation[]>([]);
  const [filter, setFilter]         = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected]     = useState<Conversation | null>(null);

  const applyFilter = useCallback((data: Conversation[], f: string | null) => {
    setFiltered(f ? data.filter(c => c.status === f) : data);
    setFilter(f);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchConversations() as Conversation[];
      setConvs(data);
      applyFilter(data, filter);
    } catch (e: unknown) { Alert.alert('Erreur', String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter, applyFilter]);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const unsub = subscribeToConversations(data => {
      setConvs(data as Conversation[]);
      applyFilter(data as Conversation[], filter);
    });
    return unsub;
  }, [filter, applyFilter]);

  const counts = {
    active:   convs.filter(c => ['new','in_progress'].includes(c.status)).length,
    payment:  convs.filter(c => c.status === 'awaiting_payment').length,
    disputed: convs.filter(c => c.status === 'disputed').length,
  };

  if (loading) return (
    <View style={pageStyles.loading}>
      <ActivityIndicator color={Colors.textPrimary} />
    </View>
  );

  return (
    <SafeAreaView style={pageStyles.root}>

      {/* Header */}
      <View style={pageStyles.header}>
        <Text style={pageStyles.pageTitle}>Support</Text>
        <View style={pageStyles.headerBadge}>
          <Text style={pageStyles.headerBadgeText}>{convs.length}</Text>
        </View>
      </View>

      {/* Stats rapides */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pageStyles.statsRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {[
          { label: 'Actives',  count: counts.active,   color: Colors.statusNew },
          { label: 'Paiement', count: counts.payment,  color: Colors.statusPayment },
          { label: 'Litiges',  count: counts.disputed, color: Colors.statusDispute },
        ].map(s => (
          <View key={s.label} style={[pageStyles.statPill, { borderColor: s.color + '30' }]}>
            <Text style={[pageStyles.statCount, { color: s.color }]}>{s.count}</Text>
            <Text style={pageStyles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Filtres */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pageStyles.filters} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {[
          { key: null,               label: 'Toutes' },
          { key: 'in_progress',      label: 'En cours' },
          { key: 'awaiting_payment', label: 'Paiement' },
          { key: 'disputed',         label: 'Litiges' },
          { key: 'delivered',        label: 'Finalisées' },
        ].map(f => (
          <TouchableOpacity
            key={String(f.key)}
            style={[pageStyles.filterChip, filter === f.key && pageStyles.filterChipActive]}
            onPress={() => applyFilter(convs, f.key)}
          >
            <Text style={[pageStyles.filterText, filter === f.key && pageStyles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Liste */}
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={({ item }) => <ConvCard conv={item} onPress={() => setSelected(item)} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.textMuted} />}
        ListEmptyComponent={
          <View style={pageStyles.empty}>
            <Text style={pageStyles.emptyText}>Aucune conversation</Text>
          </View>
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      />

      {/* Modal détail */}
      {selected && (
        <View style={modalStyles.overlay}>
          <TouchableOpacity style={modalStyles.backdrop} onPress={() => setSelected(null)} />
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.sheetTitle}>
              {selected.clients?.display_name ?? selected.clients?.whatsapp_phone}
            </Text>
            <Text style={modalStyles.sheetPhone}>{selected.clients?.whatsapp_phone}</Text>

            <FlatList
              data={selected.messages ?? []}
              keyExtractor={(_, i) => String(i)}
              style={modalStyles.msgList}
              renderItem={({ item }) => (
                <View style={[modalStyles.bubble, item.role === 'bot' ? modalStyles.botBubble : modalStyles.userBubble]}>
                  <Text style={modalStyles.bubbleText}>{item.content}</Text>
                </View>
              )}
            />

            <View style={modalStyles.actions}>
              <TouchableOpacity
                style={[modalStyles.btn, { backgroundColor: Colors.glass12 }]}
                onPress={async () => {
                  selected.is_admin_takeover
                    ? await releaseConversation(selected.id)
                    : await takeoverConversation(selected.id);
                  setSelected(null); load();
                }}
              >
                <Text style={modalStyles.btnText}>
                  {selected.is_admin_takeover ? 'Rendre à NOVA' : 'Reprendre la main'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btn, { backgroundColor: Colors.statusNew + '18', borderColor: Colors.statusNew + '30' }]}
                onPress={async () => { await resolveConversation(selected.id); setSelected(null); load(); }}
              >
                <Text style={[modalStyles.btnText, { color: Colors.statusNew }]}>Résoudre</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

export default SupportScreen;

const pageStyles = RNStyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.void },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.void },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 10 },
  pageTitle: { ...Typography.h1, fontSize: 28 },
  headerBadge: { backgroundColor: Colors.glass12, borderRadius: 50, paddingHorizontal: 10, paddingVertical: 3 },
  headerBadgeText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  statsRow: { maxHeight: 60, marginBottom: 8 },
  statPill: { ...Glass.card, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  statCount: { fontSize: 18, fontWeight: '800' },
  statLabel: { ...Typography.micro, color: Colors.textSecondary },
  filters:   { maxHeight: 50, marginBottom: 4 },
  filterChip: { ...Glass.pill, paddingHorizontal: 16, paddingVertical: 8 },
  filterChipActive: { backgroundColor: Colors.glass20, borderColor: Colors.glassBorderBright },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  filterTextActive: { color: Colors.textPrimary },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: Colors.textMuted, fontSize: 15 },
});

const modalStyles = RNStyleSheet.create({
  overlay:  { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position:           'absolute',
    bottom:             0, left: 0, right: 0,
    height:             '80%',
    backgroundColor:    Colors.surface,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    borderTopWidth:     1,
    borderColor:        Colors.glassBorder,
    padding:            20,
  },
  handle:     { width: 36, height: 4, backgroundColor: Colors.glass20, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { ...Typography.h2, marginBottom: 4 },
  sheetPhone: { ...Typography.caption, marginBottom: 16 },
  msgList:    { flex: 1 },
  bubble:     { maxWidth: '80%', padding: 10, borderRadius: 14, marginVertical: 3 },
  botBubble:  { alignSelf: 'flex-start', backgroundColor: Colors.glass12, borderWidth: 1, borderColor: Colors.glassBorder },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.glass20, borderWidth: 1, borderColor: Colors.glassBorderBright },
  bubbleText: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },
  actions:    { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1, padding: 14, borderRadius: 14,
    alignItems: 'center', borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  btnText:    { color: Colors.textPrimary, fontWeight: '700', fontSize: 13 },
});
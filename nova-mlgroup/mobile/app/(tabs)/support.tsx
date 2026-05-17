// ============================================================
// mobile/app/(tabs)/support.tsx — VERSION CORRIGÉE
// Correction : useEffect cleanup synchrone (pas de Promise)
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ActivityIndicator, SafeAreaView, ScrollView
} from 'react-native';
import {
  fetchConversations,
  subscribeToConversations,
  takeoverConversation,
  releaseConversation,
  resolveConversation,
} from '../../lib/supabase';
import type { Conversation } from '../../types';

const STATUS_CONFIG = {
  new:              { color: '#22c55e', label: 'Nouveau',       emoji: '🟢' },
  in_progress:      { color: '#eab308', label: 'En cours',      emoji: '🟡' },
  awaiting_payment: { color: '#f97316', label: 'Paiement reçu', emoji: '🟠' },
  delivered:        { color: '#3b82f6', label: 'Finalisée',     emoji: '🔵' },
  disputed:         { color: '#ef4444', label: 'Litige',        emoji: '🔴' },
} as const;

// ── Carte conversation ──────────────────────────────────────
function ConversationCard({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress: () => void;
}) {
  const config = STATUS_CONFIG[conversation.status as keyof typeof STATUS_CONFIG]
    ?? STATUS_CONFIG.new;

  const messages       = conversation.messages ?? [];
  const lastMsg        = messages[messages.length - 1]?.content?.substring(0, 55) ?? 'Nouvelle conversation';
  const displayName    = conversation.clients?.display_name
    ?? conversation.clients?.whatsapp_phone
    ?? 'Client';
  const time           = conversation.last_message_at
    ? new Date(conversation.last_message_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardRow}>
          <Text style={styles.clientName} numberOfLines={1}>
            {conversation.is_admin_takeover ? '👤 ' : '🤖 '}{displayName}
          </Text>
          <Text style={styles.timeText}>{time}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>{lastMsg}</Text>
        <View style={[styles.badge, { backgroundColor: config.color + '25' }]}>
          <Text style={[styles.badgeText, { color: config.color }]}>
            {config.emoji} {config.label}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Page Support ────────────────────────────────────────────
export default function SupportScreen() {
  const [conversations, setConversations]   = useState<Conversation[]>([]);
  const [filtered, setFiltered]             = useState<Conversation[]>([]);
  const [activeFilter, setActiveFilter]     = useState<string | null>(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [isRefreshing, setIsRefreshing]     = useState(false);
  const [selected, setSelected]             = useState<Conversation | null>(null);

  const applyFilter = useCallback(
    (convs: Conversation[], filter: string | null) => {
      setFiltered(filter ? convs.filter(c => c.status === filter) : convs);
      setActiveFilter(filter);
    },
    []
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchConversations() as Conversation[];
      setConversations(data);
      applyFilter(data, activeFilter);
    } catch (err: unknown) {
      Alert.alert('Erreur', String(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeFilter, applyFilter]);

  useEffect(() => { load(); }, []);

  // ✅ CORRECTION : subscribeToConversations retourne une fonction synchrone
  // donc useEffect peut l'utiliser directement comme cleanup
  useEffect(() => {
    const unsubscribe = subscribeToConversations((updated) => {
      setConversations(updated as Conversation[]);
      applyFilter(updated as Conversation[], activeFilter);
    });
    return unsubscribe; // ← synchrone, pas de Promise
  }, [activeFilter, applyFilter]);

  const handleTakeover = (conv: Conversation) => {
    const label = conv.is_admin_takeover ? 'Rendre à NOVA' : 'Reprendre la main';
    const msg   = conv.is_admin_takeover
      ? 'NOVA va reprendre la gestion de cette conversation.'
      : 'Le bot NOVA sera désactivé. Tu répondras manuellement via WhatsApp.';

    Alert.alert(label, msg, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: label,
        onPress: async () => {
          if (conv.is_admin_takeover) {
            await releaseConversation(conv.id);
          } else {
            await takeoverConversation(conv.id);
          }
          load();
        },
      },
    ]);
  };

  const handleResolve = (conv: Conversation) => {
    Alert.alert('Marquer comme résolu', 'Cette conversation sera archivée.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Résoudre',
        onPress: async () => {
          await resolveConversation(conv.id);
          setSelected(null);
          load();
        },
      },
    ]);
  };

  const counts = {
    active:   conversations.filter(c => ['new', 'in_progress'].includes(c.status)).length,
    awaiting: conversations.filter(c => c.status === 'awaiting_payment').length,
    disputed: conversations.filter(c => c.status === 'disputed').length,
    delivered:conversations.filter(c => c.status === 'delivered').length,
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>

      {/* Filtres */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
        {[
          { key: null,               label: 'Toutes',   count: conversations.length },
          { key: 'in_progress',      label: 'Actives',  count: counts.active },
          { key: 'awaiting_payment', label: 'Paiement', count: counts.awaiting },
          { key: 'disputed',         label: 'Litiges',  count: counts.disputed },
          { key: 'delivered',        label: 'Finalisées',count: counts.delivered },
        ].map(f => (
          <TouchableOpacity
            key={String(f.key)}
            style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
            onPress={() => applyFilter(conversations, f.key)}
          >
            <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
            {f.count > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{f.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Liste */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ConversationCard conversation={item} onPress={() => setSelected(item)} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { setIsRefreshing(true); load(); }}
            colors={['#22c55e']}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune conversation</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />

      {/* Modal détail */}
      {selected && (
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selected.clients?.display_name ?? selected.clients?.whatsapp_phone ?? 'Client'}
            </Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={selected.messages ?? []}
            keyExtractor={(_, i) => String(i)}
            style={styles.msgList}
            renderItem={({ item }) => (
              <View style={[
                styles.msgRow,
                item.role === 'bot' ? styles.botMsg : styles.userMsg
              ]}>
                <Text style={styles.msgText}>{item.content}</Text>
                <Text style={styles.msgMeta}>{item.role === 'bot' ? '🤖 NOVA' : '👤 Client'}</Text>
              </View>
            )}
          />

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#7c3aed' }]}
              onPress={() => handleTakeover(selected)}
            >
              <Text style={styles.actionBtnText}>
                {selected.is_admin_takeover ? '🤖 Rendre à NOVA' : '👤 Reprendre la main'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#059669' }]}
              onPress={() => handleResolve(selected)}
            >
              <Text style={styles.actionBtnText}>✅ Résolu</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0f172a' },
  loading:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  loadingText: { color: '#94a3b8', marginTop: 12 },

  filterBar:        { paddingHorizontal: 12, paddingVertical: 8, maxHeight: 54 },
  filterChip:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#334155', marginRight: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterChipActive: { backgroundColor: '#22c55e' },
  filterText:       { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  filterBadge:      { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 5 },
  filterBadgeText:  { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  list:        { paddingVertical: 8 },
  card:        { flexDirection: 'row', backgroundColor: '#1e293b', marginHorizontal: 12, marginVertical: 4, borderRadius: 12, padding: 12, alignItems: 'center' },
  dot:         { width: 10, height: 10, borderRadius: 5, marginRight: 12, flexShrink: 0 },
  cardContent: { flex: 1 },
  cardRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  clientName:  { color: '#f1f5f9', fontWeight: '700', fontSize: 14, flex: 1 },
  timeText:    { color: '#64748b', fontSize: 11 },
  preview:     { color: '#94a3b8', fontSize: 12, marginBottom: 5 },
  badge:       { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeText:   { fontSize: 10, fontWeight: '600' },

  empty:       { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyText:   { color: '#475569', fontSize: 16 },

  modal:       { position: 'absolute', bottom: 0, left: 0, right: 0, height: '80%', backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:  { color: '#f1f5f9', fontSize: 17, fontWeight: '700' },
  closeBtn:    { color: '#94a3b8', fontSize: 18, padding: 4 },
  msgList:     { flex: 1 },
  msgRow:      { maxWidth: '80%', padding: 10, borderRadius: 10, marginVertical: 3 },
  botMsg:      { alignSelf: 'flex-start', backgroundColor: '#334155' },
  userMsg:     { alignSelf: 'flex-end', backgroundColor: '#1d4ed8' },
  msgText:     { color: '#f1f5f9', fontSize: 14 },
  msgMeta:     { color: '#94a3b8', fontSize: 10, marginTop: 4 },
  actions:     { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn:   { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

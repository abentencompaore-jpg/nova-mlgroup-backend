// ============================================================
// components/ConversationCard.tsx
// Carte d'aperçu d'une conversation dans la liste Support
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Conversation } from '../types';

const STATUS_CONFIG = {
  new:              { color: '#22c55e', label: 'Nouveau',       emoji: '🟢' },
  in_progress:      { color: '#eab308', label: 'En cours',      emoji: '🟡' },
  awaiting_payment: { color: '#f97316', label: 'Paiement reçu', emoji: '🟠' },
  delivered:        { color: '#3b82f6', label: 'Finalisée',     emoji: '🔵' },
  disputed:         { color: '#ef4444', label: 'Litige',        emoji: '🔴' },
};

interface Props {
  conversation: Conversation;
  onPress: () => void;
}

export default function ConversationCard({ conversation, onPress }: Props) {
  const config   = STATUS_CONFIG[conversation.status] || STATUS_CONFIG.new;
  const messages = conversation.messages || [];
  const lastMsg  = messages[messages.length - 1]?.content?.substring(0, 55) || 'Nouvelle conversation';
  const name     = conversation.clients?.display_name || conversation.clients?.whatsapp_phone || 'Client';
  const time     = conversation.last_message_at
    ? new Date(conversation.last_message_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.name}>{conversation.is_admin_takeover ? '👤 ' : '🤖 '}{name}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>{lastMsg}</Text>
        <View style={[styles.badge, { backgroundColor: config.color + '25' }]}>
          <Text style={[styles.badgeText, { color: config.color }]}>{config.emoji} {config.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card:      { flexDirection: 'row', backgroundColor: '#1e293b', marginHorizontal: 12, marginVertical: 4, borderRadius: 12, padding: 12, alignItems: 'center' },
  dot:       { width: 10, height: 10, borderRadius: 5, marginRight: 12, flexShrink: 0 },
  content:   { flex: 1 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  name:      { color: '#f1f5f9', fontWeight: '700', fontSize: 14, flex: 1 },
  time:      { color: '#64748b', fontSize: 11 },
  preview:   { color: '#94a3b8', fontSize: 12, marginBottom: 5 },
  badge:     { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '600' },
});

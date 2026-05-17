// ============================================================
// components/AccountCard.tsx
// Carte d'un compte dans la page Stock (Database)
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Account } from '../types';

const STATUS_COLORS = { available: '#22c55e', assigned: '#3b82f6', expired: '#ef4444' };

interface Props {
  account: Account;
  onDelete?: () => void;
}

export default function AccountCard({ account, onDelete }: Props) {
  const color = STATUS_COLORS[account.status] || '#64748b';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.email}>{account.email}</Text>
        <View style={[styles.badge, { backgroundColor: color + '25' }]}>
          <Text style={[styles.badgeText, { color }]}>{account.status}</Text>
        </View>
      </View>
      <Text style={styles.service}>{(account as any).services?.name || 'Service inconnu'}</Text>
      {account.expires_at && (
        <Text style={styles.expires}>Expire : {new Date(account.expires_at).toLocaleDateString('fr-FR')}</Text>
      )}
      {account.status === 'available' && onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>🗑 Supprimer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card:       { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginHorizontal: 12, marginVertical: 4 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  email:      { color: '#f1f5f9', fontWeight: '600', fontSize: 13, flex: 1 },
  badge:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  service:    { color: '#94a3b8', fontSize: 12, marginBottom: 4 },
  expires:    { color: '#64748b', fontSize: 11, marginBottom: 6 },
  deleteBtn:  { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#7f1d1d', borderRadius: 6 },
  deleteText: { color: '#fca5a5', fontSize: 11, fontWeight: '600' },
});

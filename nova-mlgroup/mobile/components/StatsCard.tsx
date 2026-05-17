// ============================================================
// components/StatsCard.tsx
// Carte statistique pour la page Trésorerie
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  color?: string;
  emoji?: string;
}

export default function StatsCard({ title, value, subtitle, color = '#22c55e', emoji }: Props) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <Text style={styles.title}>{emoji ? `${emoji} ` : ''}{title}</Text>
      <Text style={[styles.value, { color }]}>{value}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card:     { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, borderLeftWidth: 3, marginHorizontal: 12, marginVertical: 4 },
  title:    { color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  value:    { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  subtitle: { color: '#64748b', fontSize: 11 },
});

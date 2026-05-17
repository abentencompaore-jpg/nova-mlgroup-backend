// ============================================================
// app/(tabs)/database.tsx
// Gestion du stock de comptes (ajouter / supprimer)
// ============================================================

import { View, Text, StyleSheet } from 'react-native';

export default function DatabaseScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🗄️ Stock</Text>
      <Text style={styles.subtitle}>Gestion des comptes disponibles</Text>
      <Text style={styles.hint}>→ À implémenter avec lib/supabase.ts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title:    { color: '#f1f5f9', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 16, marginBottom: 16 },
  hint:     { color: '#22c55e', fontSize: 13 },
});

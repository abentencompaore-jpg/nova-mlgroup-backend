// ============================================================
// mobile/app/(tabs)/treasury.tsx
// Dashboard analytique des revenus ML Group
// Graphiques via Victory Native (compatible Expo)
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, Alert
} from 'react-native';
import { fetchTreasuryStats } from '../../lib/supabase';
import type { TreasurySummary } from '../../types';

// ──────────────────────────────────────────────────────────────
// NOTE : Pour les graphiques, utilise Victory Native
// Installation : npx expo install victory-native react-native-svg
// ──────────────────────────────────────────────────────────────
// import { VictoryPie, VictoryBar, VictoryChart, VictoryAxis } from 'victory-native';

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  today: "Aujourd'hui",
  week: '7 derniers jours',
  month: 'Ce mois',
  year: 'Cette année',
  all: 'Tout le temps'
};

// Couleurs pour le graphique camembert
const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

export default function TreasuryScreen() {
  const [period, setPeriod] = useState<Period>('month');
  const [isLoading, setIsLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [summaryByService, setSummaryByService] = useState<TreasurySummary[]>([]);
  const [revenueByDay, setRevenueByDay] = useState<{ date: string; revenue: number }[]>([]);

  useEffect(() => {
    loadStats();
  }, [period]);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const stats = await fetchTreasuryStats(period);
      setTotalRevenue(stats.totalRevenue);
      setSummaryByService(stats.summaryByService);
      setRevenueByDay(stats.revenueByDay);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger les statistiques');
    } finally {
      setIsLoading(false);
    }
  };

  // Formate le montant en FCFA lisible
  const formatFCFA = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' F';
  };

  // Export CSV (version simplifiée)
  const handleExportCSV = () => {
    const csvRows = [
      'Service,Souscriptions,Revenu (FCFA)',
      ...summaryByService.map(s => `${s.service_name},${s.count},${s.revenue}`)
    ];
    const csv = csvRows.join('\n');
    // Dans une vraie app : utiliser expo-sharing + expo-file-system
    Alert.alert('Export CSV', 'Fonctionnalité disponible après installation de expo-sharing');
    console.log('CSV Data:', csv);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── SÉLECTEUR DE PÉRIODE ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodChip, period === p && styles.periodChipActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── CARTE REVENU TOTAL ── */}
        <View style={styles.revenueCard}>
          <Text style={styles.revenueLabel}>💰 Revenu Total</Text>
          <Text style={styles.revenueAmount}>{formatFCFA(totalRevenue)}</Text>
          <Text style={styles.revenuePeriod}>{PERIOD_LABELS[period]}</Text>
        </View>

        {/* ── GRAPHIQUE EN BARRES : Revenu par service ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Revenus par service</Text>
          {summaryByService.slice(0, 8).map((service, index) => {
            const maxRevenue = summaryByService[0]?.revenue || 1;
            const barWidth = (service.revenue / maxRevenue) * 100;
            
            return (
              <View key={service.service_name} style={styles.barRow}>
                <Text style={styles.barLabel} numberOfLines={1}>{service.service_name}</Text>
                <View style={styles.barContainer}>
                  <View 
                    style={[
                      styles.bar, 
                      { 
                        width: `${barWidth}%`,
                        backgroundColor: PIE_COLORS[index % PIE_COLORS.length]
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.barAmount}>{formatFCFA(service.revenue)}</Text>
              </View>
            );
          })}
        </View>

        {/* ── TABLEAU RÉCAPITULATIF ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 Tableau récapitulatif</Text>
            <TouchableOpacity onPress={handleExportCSV} style={styles.exportBtn}>
              <Text style={styles.exportBtnText}>📤 Export</Text>
            </TouchableOpacity>
          </View>
          
          {/* En-têtes */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Service</Text>
            <Text style={styles.tableHeaderCell}>Ventes</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Revenu</Text>
          </View>

          {/* Lignes */}
          {summaryByService.map((service, index) => (
            <View 
              key={service.service_name} 
              style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}
            >
              <View style={styles.serviceNameCell}>
                <View style={[styles.colorDot, { backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }]} />
                <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>
                  {service.service_name}
                </Text>
              </View>
              <Text style={styles.tableCell}>{service.count}</Text>
              <Text style={[styles.tableCell, styles.amountCell, { flex: 1.5 }]}>
                {formatFCFA(service.revenue)}
              </Text>
            </View>
          ))}

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={[styles.totalCell, { flex: 2 }]}>TOTAL</Text>
            <Text style={styles.totalCell}>
              {summaryByService.reduce((s, x) => s + x.count, 0)}
            </Text>
            <Text style={[styles.totalCell, { flex: 1.5 }]}>{formatFCFA(totalRevenue)}</Text>
          </View>
        </View>

        {/* ── ÉVOLUTION QUOTIDIENNE (texte si pas de graphique installé) ── */}
        <View style={[styles.section, { marginBottom: 30 }]}>
          <Text style={styles.sectionTitle}>📈 Évolution quotidienne</Text>
          {revenueByDay.length === 0 ? (
            <Text style={styles.emptyText}>Aucune vente sur cette période</Text>
          ) : (
            revenueByDay.slice(-7).map((day) => (
              <View key={day.date} style={styles.dayRow}>
                <Text style={styles.dayDate}>{day.date}</Text>
                <Text style={styles.dayRevenue}>{formatFCFA(day.revenue)}</Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  
  periodScroll: { paddingHorizontal: 12, paddingVertical: 10 },
  periodChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1e293b', marginRight: 8 },
  periodChipActive: { backgroundColor: '#22c55e' },
  periodText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  periodTextActive: { color: '#fff' },
  
  revenueCard: { margin: 12, backgroundColor: '#064e3b', borderRadius: 16, padding: 20, alignItems: 'center' },
  revenueLabel: { color: '#6ee7b7', fontSize: 14, marginBottom: 4 },
  revenueAmount: { color: '#ffffff', fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  revenuePeriod: { color: '#34d399', fontSize: 12, marginTop: 4 },
  
  section: { margin: 12, backgroundColor: '#1e293b', borderRadius: 16, padding: 16 },
  sectionTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  exportBtn: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  exportBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  
  barRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 5, gap: 8 },
  barLabel: { color: '#94a3b8', fontSize: 11, width: 80 },
  barContainer: { flex: 1, height: 12, backgroundColor: '#334155', borderRadius: 6, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 6 },
  barAmount: { color: '#f1f5f9', fontSize: 11, fontWeight: '600', width: 80, textAlign: 'right' },
  
  tableHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
  tableHeaderCell: { color: '#64748b', fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, alignItems: 'center' },
  tableRowEven: { backgroundColor: '#243044' },
  serviceNameCell: { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 },
  colorDot: { width: 8, height: 8, borderRadius: 4 },
  tableCell: { color: '#cbd5e1', fontSize: 12, flex: 1, textAlign: 'center' },
  amountCell: { color: '#22c55e', fontWeight: '700' },
  totalRow: { flexDirection: 'row', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#22c55e', marginTop: 4 },
  totalCell: { color: '#22c55e', fontSize: 13, fontWeight: '800', flex: 1, textAlign: 'center' },
  
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#334155' },
  dayDate: { color: '#94a3b8', fontSize: 12 },
  dayRevenue: { color: '#22c55e', fontSize: 12, fontWeight: '700' },
  emptyText: { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
});
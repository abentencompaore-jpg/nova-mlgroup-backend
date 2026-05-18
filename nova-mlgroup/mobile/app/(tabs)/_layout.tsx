// ============================================================
// mobile/app/(tabs)/_layout.tsx — CORRIGÉ v2
// Fix : BottomTabBarIconProps n'existe pas → typage inline
// ============================================================

import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors } from '../../lib/theme';

const TABS = [
  { name: 'support',  label: 'Support',  icon: '◈' },
  { name: 'database', label: 'Stock',    icon: '◫' },
  { name: 'treasury', label: 'Revenus',  icon: '◉' },
  { name: 'renewals', label: 'Relances', icon: '◷' },
];

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={[styles.wrap, focused && styles.wrapActive]}>
      <Text style={[styles.icon, { color: focused ? Colors.textPrimary : Colors.textMuted }]}>
        {icon}
      </Text>
      {focused && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:   false,
        tabBarStyle: {
          backgroundColor: Colors.void,
          borderTopColor:  Colors.glassBorder,
          borderTopWidth:  1,
          height:          Platform.OS === 'ios' ? 84 : 64,
          paddingBottom:   Platform.OS === 'ios' ? 24 : 8,
          paddingTop:      8,
        },
        tabBarShowLabel: false,
      }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarIcon: ({ focused }: { focused: boolean }) => (
              <TabIcon icon={tab.icon} label={tab.label} focused={focused} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 50, gap: 6,
  },
  wrapActive: {
    backgroundColor: Colors.glass12,
    borderWidth: 1, borderColor: Colors.glassBorder,
  },
  icon:  { fontSize: 18 },
  label: { fontSize: 11, fontWeight: '600', color: Colors.textPrimary, letterSpacing: 0.3 },
});

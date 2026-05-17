// ============================================================
// app/(tabs)/_layout.tsx
// Navigation par onglets du bas
// ============================================================

import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#64748b',
      }}
    >
      <Tabs.Screen name="support"  options={{ title: 'Support',    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text> }} />
      <Tabs.Screen name="database" options={{ title: 'Stock',      tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🗄️</Text> }} />
      <Tabs.Screen name="treasury" options={{ title: 'Trésorerie', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💰</Text> }} />
    </Tabs>
  );
}

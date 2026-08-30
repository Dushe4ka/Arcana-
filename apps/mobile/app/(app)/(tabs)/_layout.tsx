import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

import { colors } from "../../../lib/theme";

function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        // Bottom nav removed for now (see HomeHeader's avatar, which routes to
        // Profile) - the extra tabs the reference mock shows (Библиотека,
        // Поиск, Клуб) don't have screens behind them yet.
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Истории", tabBarIcon: ({ color }) => <TabIcon symbol="📖" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Профиль", tabBarIcon: ({ color }) => <TabIcon symbol="👤" color={color} /> }}
      />
    </Tabs>
  );
}

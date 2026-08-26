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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
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

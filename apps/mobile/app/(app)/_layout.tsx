import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "../../lib/auth-store";
import { colors } from "../../lib/theme";

export default function AppLayout() {
  const status = useAuthStore((s) => s.status);

  if (status === "signedOut") return <Redirect href="/(auth)/login" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="story/[id]" options={{ title: "" }} />
    </Stack>
  );
}

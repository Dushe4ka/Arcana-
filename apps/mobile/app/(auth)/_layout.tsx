import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "../../lib/auth-store";
import { colors } from "../../lib/theme";

export default function AuthLayout() {
  const status = useAuthStore((s) => s.status);

  if (status === "signedIn") return <Redirect href="/(app)/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}

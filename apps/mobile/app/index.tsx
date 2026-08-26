import { Redirect } from "expo-router";

import { useAuthStore } from "../lib/auth-store";

export default function Index() {
  const status = useAuthStore((s) => s.status);
  return <Redirect href={status === "signedIn" ? "/(app)/(tabs)" : "/(auth)/login"} />;
}

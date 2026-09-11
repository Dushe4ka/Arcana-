import * as Linking from "expo-linking";

import { apiRequest } from "./api";

const CABINET_URL = (process.env.EXPO_PUBLIC_CABINET_URL ?? "http://localhost:3100").replace(
  /\/$/,
  "",
);

// Kept in sync by hand with apps/cabinet/lib/routes.ts's CABINET_ROUTES - a separate app/package,
// not worth a shared module for three literal strings.
type CabinetPath = "/" | "/shop" | "/stats";

/** Mint a 60-second one-time code and hand the player a cabinet session in the SYSTEM browser
 * (not an in-app WebView — the user must physically leave the app; see the design spec's
 * Apple-risk rationale). Throws if the code request fails; the caller shows the error. */
export async function openCabinet(path: CabinetPath = "/"): Promise<void> {
  const { code } = await apiRequest<{ code: string; expiresInSeconds: number }>(
    "/auth/cabinet-link-token",
    { method: "POST" },
  );
  const url = `${CABINET_URL}/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(path)}`;
  await Linking.openURL(url);
}

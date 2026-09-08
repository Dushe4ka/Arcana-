import type { NextResponse } from "next/server";

import { cookieSecure } from "./env";

export const AT_COOKIE = "arcana_cab_at";
export const RT_COOKIE = "arcana_cab_rt";

/** Cookie lifespan caps. The JWT's own `exp` is the real gate — these just bound how long a
 * stale cookie can linger in the browser. */
export const ACCESS_COOKIE_MAX_AGE = 60 * 20;
export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Shared attributes for both session cookies. `maxAge` is set per-cookie by the caller. */
export function cookieOptions() {
  return { httpOnly: true, secure: cookieSecure(), sameSite: "lax" as const, path: "/" };
}

/** Write both session cookies onto an outgoing response. Shared by `proxy.ts` (token refresh)
 * and the one-time-code callback route handler so the cookie attributes and lifespans stay in
 * one place. */
export function writeSessionCookies(
  response: NextResponse,
  pair: { accessToken: string; refreshToken: string },
): void {
  response.cookies.set(AT_COOKIE, pair.accessToken, {
    ...cookieOptions(),
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  response.cookies.set(RT_COOKIE, pair.refreshToken, {
    ...cookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

/** Decode a JWT payload (no signature check — the backend verifies) and report whether it is
 * expired, treating anything within `skewSeconds` of expiry as already expired so the proxy
 * refreshes a hair early instead of racing the backend. Returns true for an unparseable token. */
export function jwtExpired(token: string, skewSeconds = 15): boolean {
  try {
    const [, payload] = token.split(".");
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof json.exp !== "number") return true;
    return json.exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}

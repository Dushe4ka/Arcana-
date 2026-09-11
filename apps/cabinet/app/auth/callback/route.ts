import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiBaseUrl } from "@/lib/env";
import { CABINET_ROUTES } from "@/lib/routes";
import { writeSessionCookies } from "@/lib/session";

/** Only these in-app paths may be used as a post-login redirect target — an open redirect here
 * would let a crafted deeplink bounce a freshly authenticated user to an attacker's site. */
const SAFE_NEXT: ReadonlySet<string> = new Set(CABINET_ROUTES);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next");
  const next = nextParam && SAFE_NEXT.has(nextParam) ? nextParam : "/";

  const expired = new URL("/session-expired", request.url);
  if (!code) return NextResponse.redirect(expired);

  let pair: { accessToken?: string; refreshToken?: string } | null = null;
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/cabinet-exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    if (res.ok) pair = await res.json();
  } catch {
    // network / parse error — fall through to the expired page
  }

  // A malformed 200 (missing either token) must not create a broken session.
  if (!pair?.accessToken || !pair?.refreshToken) return NextResponse.redirect(expired);

  const response = NextResponse.redirect(new URL(next, request.url));
  writeSessionCookies(response, { accessToken: pair.accessToken, refreshToken: pair.refreshToken });
  return response;
}

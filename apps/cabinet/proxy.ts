import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiBaseUrl } from "./lib/env";
import { AT_COOKIE, RT_COOKIE, jwtExpired, writeSessionCookies } from "./lib/session";

// Run on every route EXCEPT the ones that must work without a session, and static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|session-expired|auth/callback).*)"],
};

export async function proxy(request: NextRequest) {
  const access = request.cookies.get(AT_COOKIE)?.value;
  const refresh = request.cookies.get(RT_COOKIE)?.value;

  if (!refresh) return redirectExpired(request);
  if (access && !jwtExpired(access)) return NextResponse.next();

  // Access token missing or (near-)expired — refresh it before the route renders.
  let pair: { accessToken: string; refreshToken: string } | null = null;
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: "no-store",
    });
    if (res.ok) pair = await res.json();
  } catch {
    // network error — fall through to the expired page
  }

  // A malformed 200 (missing either token) must not write literal "undefined" cookies.
  if (!pair?.accessToken || !pair?.refreshToken) return redirectExpired(request);

  // Mutate the *request* cookies too, then forward the request — Next does not feed the
  // response's Set-Cookie back into `cookies()` for this same pass, so without this the
  // page rendered by this very request would still read the old, expired access token.
  request.cookies.set(AT_COOKIE, pair.accessToken);
  request.cookies.set(RT_COOKIE, pair.refreshToken);
  const response = NextResponse.next({ request });
  writeSessionCookies(response, pair);
  return response;
}

function redirectExpired(request: NextRequest) {
  // No cookie deletion here: two concurrent requests on an expired access token both send the
  // same one-time refresh token — the winner gets a fresh pair (Set-Cookie), the loser gets a
  // 401 and lands here. Deleting cookies here would race the winner's Set-Cookie and could wipe
  // a session that is actually alive. A genuinely dead refresh token just redirects again on
  // the next request (no loop — `/session-expired` is outside the matcher), and a successful
  // `/auth/callback` overwrites the stale cookies via `writeSessionCookies`.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    // `/api/*` callers do `res.json()` — give them a JSON 401, not an HTML redirect.
    return NextResponse.json(
      { message: "Сессия истекла, вернитесь в приложение" },
      { status: 401 },
    );
  }
  return NextResponse.redirect(new URL("/session-expired", request.url));
}

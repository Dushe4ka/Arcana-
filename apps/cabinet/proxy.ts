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
  const response = NextResponse.redirect(new URL("/session-expired", request.url));
  response.cookies.delete(AT_COOKIE);
  response.cookies.delete(RT_COOKIE);
  return response;
}

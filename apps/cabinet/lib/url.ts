import type { NextRequest } from "next/server";

/** This request's own origin, built from its `Host` header — never from `request.url` /
 * `request.nextUrl`. The standalone server (`next start` / `.next/standalone/server.js`)
 * constructs those from its own bind hostname ("0.0.0.0", to listen on all interfaces), not
 * the client's real `Host` header, so `new URL(path, request.url)` silently redirects to
 * `http://0.0.0.0:<port>/...` — a host no client can ever reach. `x-forwarded-proto` covers a
 * future TLS-terminating reverse proxy in front of this app; falls back to the request's own
 * scheme otherwise. */
export function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

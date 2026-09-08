import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { apiBaseUrl } from "./env";
import { AT_COOKIE } from "./session";

export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];

  constructor(status: number, message: string, issues?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

/** Server-side fetch to the backend, authenticated with the access-token cookie. The proxy
 * has already refreshed it if needed, so a 401 here means the session is genuinely gone. */
export async function serverFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(AT_COOKIE)?.value;
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? `Ошибка сервера (${res.status})`, body?.issues);
  }
  return body as T;
}

/** Same as serverFetch, but a 401 redirects to the session-expired page instead of throwing —
 * use this from server components rendering the cabinet's own pages. */
export async function fetchOrExpire<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await serverFetch<T>(path, init);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/session-expired");
    throw err;
  }
}

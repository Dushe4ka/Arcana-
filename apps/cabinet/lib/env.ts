export function apiBaseUrl(): string {
  return (process.env.API_BASE_URL || "http://localhost:4000/api").replace(/\/$/, "");
}

export function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "true";
}

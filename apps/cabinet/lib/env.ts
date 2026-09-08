export function apiBaseUrl(): string {
  const configured = process.env.API_BASE_URL;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("API_BASE_URL is required in production");
    }
    return "http://localhost:4000/api";
  }
  return configured.replace(/\/$/, "");
}

// Secure in production unless explicitly disabled; never in dev (http localhost).
export function cookieSecure(): boolean {
  if (process.env.NODE_ENV === "production") return process.env.COOKIE_SECURE !== "false";
  return process.env.COOKIE_SECURE === "true";
}

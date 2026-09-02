"use client";

import { useEffect } from "react";

import { useAuthStore } from "@/lib/auth-store";

/** Calls hydrate() once on mount, client-side only - localStorage doesn't exist during SSR,
 * and doing this per-page would race multiple times as the user navigates. Renders nothing;
 * mounted once in the root layout. */
export function HydrateAuth() {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return null;
}

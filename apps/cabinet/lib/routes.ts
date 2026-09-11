/** Canonical list of in-app cabinet pages a deeplink or redirect may target. Single source of
 * truth for `/auth/callback`'s open-redirect allowlist and the nav bar in `AppShell` - a typo'd
 * path in either one is now a type error instead of a silent drift between the two.
 *
 * `apps/mobile/lib/cabinet.ts`'s `CabinetPath` union duplicates the subset it links to (it's a
 * separate app/package with no shared module with `apps/cabinet` - not worth introducing one
 * for three literal strings). Keep that list in sync by hand if a route here changes. */
export const CABINET_ROUTES = ["/", "/stats", "/shop", "/wallet"] as const;

export type CabinetRoute = (typeof CABINET_ROUTES)[number];

# Admin Panel Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/admin` (Next.js) as a working tool a scriptwriter can actually use:
log in, create a story, manage its seasons/chapters, and add characters with uploaded
sprites — everything except the scene/dialogue editor itself, which is a separate follow-up
plan (list+graph editor, preview) once this foundation exists to build it on.

**Architecture:** New Next.js 16 App Router app in the pnpm workspace, talking to the
existing `apps/api` backend (all endpoints already exist and are tested - see
`docs/superpowers/plans/2026-09-01-admin-panel-backend-foundation.md`, merged to `main`).
Client-side only (no server components doing data fetching) - every authenticated page is a
Client Component calling the backend directly with a bearer token, mirroring the pattern
`apps/mobile` already uses for its API client and auth store.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4,
Zustand (state), `@arcana/shared` (Zod schemas + enums, already published as a workspace
package). No new form library - `@arcana/shared`'s existing Zod schemas validate on submit.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-panel-design.md`

## Global Constraints

- TypeScript `strict: true` (Next.js's generated `tsconfig.json` already sets this - don't
  loosen it).
- Design is explicitly out of scope for this plan - the user said so directly ("дизайн мне
  вообще по боку... можно оставить просто однотонный"). Plain Tailwind utility classes,
  system font stack, no custom visual design work. Do **not** invoke `frontend-design`,
  `ui-ux-pro-max`, `critique`, or `polish` for this plan - they're mandatory elsewhere in
  this project by standing instruction, explicitly waived here by direct user request.
- Every authenticated page/action must reject anyone whose role isn't `WRITER`/`EDITOR`/
  `ADMIN` - the backend already enforces this server-side (403), but the UI should also
  redirect a signed-in `PLAYER` away rather than showing broken screens.
- Reuse `@arcana/shared`'s existing Zod schemas/enums (`storyCreateSchema`,
  `characterCreateSchema`, `STORY_GENRES`, etc.) instead of re-declaring shapes locally -
  this package exists specifically so admin/mobile don't drift from the backend's Pydantic
  schemas.
- No automated test runner exists yet for any TypeScript package in this repo (`apps/mobile`
  has none either - confirmed, not an oversight). Verification for every task in this plan is
  `pnpm --filter @arcana/admin typecheck` (must be clean) + `pnpm --filter @arcana/admin
  lint` (must be clean) + a manual browser/curl check described in the task - matching the
  existing convention, not introducing a new one mid-project.
- Backend must be running for manual verification: `cd apps/api && source .venv/bin/activate
  && uvicorn app.main:app --reload --port 4000` (separate terminal, left running across
  tasks).

## Out of scope for this plan

The scene/dialogue editor (linear list + React Flow graph, per the spec) and the chapter
preview UI are a separate, later plan - they depend on this foundation (auth, layout, a
story to attach scenes to) existing first.

---

## Task 1: Scaffold `apps/admin`

**Files:**
- Create: `apps/admin/` (via `create-next-app`, then adjusted - see steps)
- Modify: `apps/admin/package.json` (name, workspace dependency, scripts)
- Modify: `apps/admin/app/layout.tsx`, `apps/admin/app/page.tsx` (replace generated content)
- Delete: `apps/admin/app/globals.css`'s generated demo styling, `apps/admin/public/*.svg`
  (unused demo assets), `apps/admin/AGENTS.md`, `apps/admin/CLAUDE.md` (Next.js's own
  generated dev-time file, unrelated to this repo's real per-app `CLAUDE.md`/`AGENTS.md`
  convention - see the note in Step 3)

**Interfaces:**
- Produces: a buildable, empty Next.js app at `apps/admin`, registered in the pnpm workspace
  with `@arcana/shared` as a dependency. Task 2 builds `lib/api.ts`/`lib/auth-store.ts` on
  top of this; Task 3 replaces `app/page.tsx`.

- [ ] **Step 1: Scaffold with `create-next-app`**

Run from the repo root:

```bash
npx create-next-app@latest apps/admin --typescript --tailwind --app --no-src-dir --import-alias "@/*" --eslint=false --turbopack=false --yes
```

This produces Next.js 16.x + React 19.x + Tailwind 4 (verified locally before writing this
plan - exact versions may drift slightly by the time you run it; that's fine, this is a
fresh scaffold, not a pinned dependency). `--eslint=false` still installs `eslint`/
`eslint-config-next` as devDependencies but skips generating a Next-specific eslint config -
this repo's root `eslint.config.js` (flat config, `typescript-eslint`) already covers
`apps/*`, so a second per-app config would just conflict.

- [ ] **Step 2: Wire into the pnpm workspace**

Edit `apps/admin/package.json`:

```json
{
  "name": "@arcana/admin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arcana/shared": "workspace:*",
    "next": "<the version create-next-app installed>",
    "react": "<the version create-next-app installed>",
    "react-dom": "<the version create-next-app installed>"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "<the version create-next-app installed>",
    "@types/node": "<the version create-next-app installed>",
    "@types/react": "<the version create-next-app installed>",
    "@types/react-dom": "<the version create-next-app installed>",
    "tailwindcss": "<the version create-next-app installed>",
    "typescript": "<the version create-next-app installed>"
  }
}
```

(Keep whatever exact version strings `create-next-app` actually wrote - don't hand-edit
those. The only real changes here are: `name` -> `@arcana/admin`, add the `@arcana/shared`
dependency, add the `typecheck` script, remove the standalone `eslint`/`eslint-config-next`
devDependencies since the root config covers linting - if `pnpm lint` complains about a
missing local eslint config, keep them instead of fighting it; either way is fine, just note
which you did in your report.)

Delete `apps/admin/package-lock.json` (created by the `npx` scaffold using npm; this
monorepo uses pnpm exclusively - `pnpm-lock.yaml` at the repo root is the only lockfile).
Delete `apps/admin/.git` if `create-next-app` initialized a nested repo (it does by
default) - this must live inside the existing single repo, not its own.

Run `pnpm install` from the repo root.

- [ ] **Step 3: Remove generated boilerplate that doesn't belong**

Delete `apps/admin/AGENTS.md` and `apps/admin/CLAUDE.md` - these are auto-generated by
`create-next-app`/`next dev` (a version-specific dev-time warning block, regenerated on
`next dev` if it doesn't exist, not this repo's real documentation convention - don't confuse
it with `apps/mobile/CLAUDE.md`, which is a real hand-authored file). If `next dev` recreates
them later, that's expected and fine - just don't commit them.

Delete `apps/admin/public/*.svg` (Next.js/Vercel demo icons, unused).

- [ ] **Step 4: Replace the generated demo page with a minimal placeholder**

`apps/admin/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arcana Admin",
  description: "Панель сценариста Arcana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full bg-neutral-100 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
```

`apps/admin/app/globals.css` - replace entirely with just the Tailwind import (drop the
generated demo theme/dark-mode variables, not needed for this plan's plain styling):

```css
@import "tailwindcss";
```

`apps/admin/app/page.tsx` - temporary placeholder, replaced by Task 3's real redirect logic:

```tsx
export default function Home() {
  return <div className="p-8">Arcana Admin</div>;
}
```

- [ ] **Step 5: Verify it builds**

Run: `pnpm --filter @arcana/admin build`
Expected: build succeeds, no errors. (`create-next-app`'s generated `next.config.ts` and
`tsconfig.json` need no changes for this plan - leave them as generated.)

Run: `pnpm --filter @arcana/admin typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/admin pnpm-lock.yaml
git commit -m "feat(admin): scaffold apps/admin (Next.js 16 + Tailwind + workspace wiring)"
```

---

## Task 2: API client, auth store, login page

**Files:**
- Create: `apps/admin/lib/api.ts`
- Create: `apps/admin/lib/auth-store.ts`
- Create: `apps/admin/app/login/page.tsx`
- Create: `apps/admin/.env.local.example`

**Interfaces:**
- Consumes: `@arcana/shared`'s `loginSchema`, `LoginInput` (`@arcana/shared`)
- Produces: `apiRequest<T>(path, options) => Promise<T>` and `ApiError` (`lib/api.ts`);
  `useAuthStore()` Zustand hook with `{ status: "loading"|"signedOut"|"signedIn", user,
  accessToken, login, logout, hydrate }` (`lib/auth-store.ts`). Task 3's layout consumes
  `useAuthStore` to gate every authenticated route.

- [ ] **Step 1: Write the API client**

`apps/admin/lib/api.ts` - deliberately mirrors `apps/mobile/lib/api.ts`'s shape (same
`ApiError`, same one-retry-on-401 pattern) since the backend's error envelope and auth flow
are identical for both clients; the only real difference is env var name and no
`SecureStore`-style persistence concern at this layer (that's `auth-store.ts`'s job):

```typescript
export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];

  constructor(status: number, message: string, issues?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

const DEFAULT_BASE_URL = "http://localhost:4000/api";

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  return (configured || DEFAULT_BASE_URL).replace(/\/$/, "");
}

type TokenGetter = () => string | null;
type UnauthorizedHandler = () => Promise<string | null>;

// The auth store wires itself in here at module load (see auth-store.ts) so this module
// never has to import the store directly and create a circular dependency - same pattern
// as apps/mobile/lib/api.ts.
let getAccessToken: TokenGetter = () => null;
let handleUnauthorized: UnauthorizedHandler = async () => null;

export function configureApi(opts: {
  getAccessToken: TokenGetter;
  onUnauthorized: UnauthorizedHandler;
}): void {
  getAccessToken = opts.getAccessToken;
  handleUnauthorized = opts.onUnauthorized;
}

// `formData: true` marks a multipart upload body (FormData, not a JSON string) - it skips
// the "Content-Type": "application/json" header entirely so fetch can set the correct
// multipart boundary itself. Never set both formData and a JSON string body.
type RequestOptions = RequestInit & { auth?: boolean; formData?: boolean };

async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const { auth = true, formData, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    ...(formData ? {} : { "Content-Type": "application/json" }),
    ...((headers as Record<string, string>) ?? {}),
  };
  if (auth) {
    const token = getAccessToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, { ...rest, headers: finalHeaders });
  } catch {
    throw new ApiError(0, "Не удалось подключиться к серверу. Проверьте, что backend запущен.");
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body?.message ?? `Ошибка сервера (${response.status})`, body?.issues);
  }
  return body as T;
}

/** All API calls should go through this - it retries exactly once after a 401 by asking the
 * auth store to refresh the access token, so a component never has to think about token
 * expiry itself. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && options.auth !== false) {
      const refreshedToken = await handleUnauthorized();
      if (refreshedToken) {
        return await rawRequest<T>(path, options);
      }
    }
    throw err;
  }
}
```

- [ ] **Step 2: Write the auth store**

`apps/admin/lib/auth-store.ts` - same shape as `apps/mobile/lib/auth-store.ts`, but
`localStorage` instead of `expo-secure-store` (this is a browser app; `localStorage` is
per-origin and this is an internal tool behind login, same tradeoff already accepted for
`apps/mobile`'s own token storage in spirit - not a new security posture for the project) and
no `register` action (admin accounts are never self-registered - see the spec's "no public
path to become a scriptwriter" decision):

```typescript
import { create } from "zustand";

import { apiRequest, configureApi, ApiError } from "./api";

type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

type TokenPair = { accessToken: string; refreshToken: string };
type AuthResponse = TokenPair & { user: PublicUser };

const ACCESS_KEY = "arcana-admin.accessToken";
const REFRESH_KEY = "arcana-admin.refreshToken";
const USER_KEY = "arcana-admin.user";

type AuthStatus = "loading" | "signedOut" | "signedIn";

type AuthState = {
  status: AuthStatus;
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  hydrate: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  accessToken: null,
  refreshToken: null,
  error: null,

  hydrate: () => {
    if (typeof window === "undefined") return;
    const accessToken = window.localStorage.getItem(ACCESS_KEY);
    const refreshToken = window.localStorage.getItem(REFRESH_KEY);
    const userJson = window.localStorage.getItem(USER_KEY);
    if (accessToken && refreshToken && userJson) {
      set({ accessToken, refreshToken, user: JSON.parse(userJson) as PublicUser, status: "signedIn" });
    } else {
      set({ status: "signedOut" });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const res = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        auth: false,
      });
      persistAuth(res);
      set({ user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken, status: "signedIn" });
    } catch (err) {
      set({ error: describeError(err) });
      throw err;
    }
  },

  logout: async () => {
    const { refreshToken } = get();
    set({ status: "signedOut", user: null, accessToken: null, refreshToken: null, error: null });
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
    if (refreshToken) {
      apiRequest("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        auth: false,
      }).catch(() => {});
    }
  },

  clearError: () => set({ error: null }),
}));

function persistAuth(res: AuthResponse): void {
  window.localStorage.setItem(ACCESS_KEY, res.accessToken);
  window.localStorage.setItem(REFRESH_KEY, res.refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Не удалось подключиться к серверу";
}

configureApi({
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: async () => {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) return null;
    try {
      const res = await apiRequest<TokenPair>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        auth: false,
      });
      window.localStorage.setItem(ACCESS_KEY, res.accessToken);
      window.localStorage.setItem(REFRESH_KEY, res.refreshToken);
      useAuthStore.setState({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      return res.accessToken;
    } catch {
      await useAuthStore.getState().logout();
      return null;
    }
  },
});
```

- [ ] **Step 3: Write the login page**

`apps/admin/app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginSchema } from "@arcana/shared";

import { useAuthStore } from "@/lib/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Проверьте введённые данные");
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      router.replace("/stories");
    } catch {
      // useAuthStore already set `error` - rendered below.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded border border-neutral-300 bg-white p-6">
        <h1 className="text-lg font-semibold">Arcana Admin</h1>
        <div>
          <label className="block text-sm text-neutral-600">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-600">Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            autoComplete="current-password"
          />
        </div>
        {(fieldError || error) && <p className="text-sm text-red-600">{fieldError ?? error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Write `.env.local.example`**

`apps/admin/.env.local.example`:

```
# Backend API base URL (including /api). Defaults to http://localhost:4000/api if unset.
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `pnpm --filter @arcana/admin lint` - both
clean.

Manual check (backend running per Global Constraints): `pnpm --filter @arcana/admin dev`,
open `http://localhost:3000/login`, log in with `admin@arcana.app` / `ChangeMe123!` (the
seeded admin account). Expected: no console errors, `localStorage` gains
`arcana-admin.accessToken` (check via browser devtools), navigating to `/stories` doesn't
404 (Task 3 fills it in properly, but Next.js shouldn't crash on an unmatched route showing
its default 404 - that's expected and fine at this point in the plan).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/lib apps/admin/app/login apps/admin/.env.local.example
git commit -m "feat(admin): API client, auth store, login page"
```

---

## Task 3: Authenticated app shell

**Files:**
- Create: `apps/admin/app/(app)/layout.tsx`
- Create: `apps/admin/components/HydrateAuth.tsx`
- Modify: `apps/admin/app/layout.tsx` (mount the hydration component once, root-wide)
- Modify: `apps/admin/app/page.tsx` (redirect logic instead of the Task 1 placeholder)

**Interfaces:**
- Consumes: `useAuthStore` (Task 2)
- Produces: the `(app)` route group - every page Task 4/5/6 adds under `app/(app)/...` is
  automatically role-gated and gets the shared nav for free, without repeating the guard
  logic in each page.

- [ ] **Step 1: Root-level auth hydration**

Zustand's store starts with `status: "loading"` and needs `hydrate()` called once on the
client after mount (it reads `localStorage`, which doesn't exist during SSR). Do this once
at the root, not per-page:

`apps/admin/components/HydrateAuth.tsx`:

```tsx
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
```

In `apps/admin/app/layout.tsx`, import and render it inside `<body>`, before `{children}`:

```tsx
import { HydrateAuth } from "@/components/HydrateAuth";
// ...
      <body className="min-h-full bg-neutral-100 text-neutral-900 antialiased">
        <HydrateAuth />
        {children}
      </body>
```

- [ ] **Step 2: The role-gated `(app)` layout**

`apps/admin/app/(app)/layout.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useAuthStore } from "@/lib/auth-store";

const ALLOWED_ROLES = ["WRITER", "EDITOR", "ADMIN"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (status === "signedOut") {
      router.replace("/login");
    } else if (status === "signedIn" && user && !ALLOWED_ROLES.includes(user.role)) {
      // A PLAYER account somehow signed in here - the backend would 403 every request
      // anyway, so bounce them out immediately rather than showing broken screens.
      router.replace("/login");
    }
  }, [status, user, router]);

  if (status === "loading" || status === "signedOut") {
    return <div className="p-8 text-neutral-500">Загрузка…</div>;
  }
  if (user && !ALLOWED_ROLES.includes(user.role)) {
    return <div className="p-8 text-neutral-500">Загрузка…</div>;
  }

  return (
    <div className="min-h-full">
      <nav className="flex items-center justify-between border-b border-neutral-300 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Arcana Admin</span>
          <Link href="/stories" className="text-sm text-neutral-600 hover:text-neutral-900">
            Истории
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm text-neutral-600">
          <span>{user?.email}</span>
          <button
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="text-neutral-600 underline hover:text-neutral-900"
          >
            Выйти
          </button>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Root page redirects instead of showing a placeholder**

Replace `apps/admin/app/page.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/lib/auth-store";

export default function Home() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "signedIn") router.replace("/stories");
    else if (status === "signedOut") router.replace("/login");
  }, [status, router]);

  return <div className="p-8 text-neutral-500">Загрузка…</div>;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `pnpm --filter @arcana/admin lint` - clean.

Manual check: with the dev server running, visit `http://localhost:3000/` signed out ->
redirected to `/login`. Log in -> redirected to `/stories` (still 404 at this point, Task 4
adds the page - expected). Manually visit `/stories` while signed out -> redirected to
`/login`. Log out via the nav button -> redirected to `/login`, `localStorage` cleared.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/\(app\) apps/admin/components apps/admin/app/layout.tsx apps/admin/app/page.tsx
git commit -m "feat(admin): role-gated app shell with nav and logout"
```

---

## Task 4: Stories list + create

**Files:**
- Create: `apps/admin/app/(app)/stories/page.tsx`
- Create: `apps/admin/lib/types.ts`

**Interfaces:**
- Consumes: `useAuthStore`, `apiRequest` (Task 2), `storyCreateSchema` (`@arcana/shared`)
- Produces: `StoryOut`, `StoryDetailOut` types (`lib/types.ts`) - Task 5/6 import these
  rather than redeclaring the response shape.

- [ ] **Step 1: Response types**

`apps/admin/lib/types.ts` - mirrors `apps/api/app/schemas/responses.py`'s `StoryOut`/
`StoryDetailOut`/`SeasonOut`/`ChapterOut`/`CharacterOut` field-for-field (camelCase, per the
backend's `CamelModel` convention):

```typescript
import type { LocalizedText, StoryGenre, ContentStatus } from "@arcana/shared";

export type StoryOut = {
  id: string;
  slug: string;
  title: LocalizedText;
  description: LocalizedText | null;
  coverImageUrl: string | null;
  status: ContentStatus;
  genre: StoryGenre;
  createdAt: string;
  updatedAt: string;
};

export type ChapterOut = {
  id: string;
  seasonId: string;
  index: number;
  title: LocalizedText;
  status: ContentStatus;
  unlockCost: number;
  entryNodeId: string | null;
};

export type SeasonOut = {
  id: string;
  storyId: string;
  index: number;
  title: LocalizedText;
  chapters: ChapterOut[];
};

export type CharacterOut = {
  id: string;
  storyId: string;
  name: LocalizedText;
  nameColor: string;
  sprites: Record<string, string>;
};

export type StoryDetailOut = StoryOut & {
  seasons: SeasonOut[];
  characters: CharacterOut[];
};
```

If `LocalizedText` isn't already exported from `@arcana/shared` (check
`packages/shared/src/schemas/common.ts` and `packages/shared/src/index.ts` first), add a
minimal local type instead of modifying the shared package in this plan:
`type LocalizedText = { ru: string; en?: string }`.

- [ ] **Step 2: Stories list + create form**

`apps/admin/app/(app)/stories/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { storyCreateSchema, STORY_GENRES } from "@arcana/shared";

import { apiRequest, ApiError } from "@/lib/api";
import type { StoryOut } from "@/lib/types";

export default function StoriesPage() {
  const [stories, setStories] = useState<StoryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setStories(await apiRequest<StoryOut[]>("/admin/stories"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить истории");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Истории</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          {showCreate ? "Отмена" : "Создать историю"}
        </button>
      </div>

      {showCreate && (
        <CreateStoryForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-neutral-500">Загрузка…</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
          {stories.map((story) => (
            <li key={story.id}>
              <Link href={`/stories/${story.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50">
                <span>{story.title.ru}</span>
                <span className="text-xs text-neutral-500">
                  {story.genre} · {story.status}
                </span>
              </Link>
            </li>
          ))}
          {stories.length === 0 && <li className="px-4 py-3 text-neutral-500">Пока нет историй</li>}
        </ul>
      )}
    </div>
  );
}

function CreateStoryForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [titleRu, setTitleRu] = useState("");
  const [genre, setGenre] = useState<(typeof STORY_GENRES)[number]>(STORY_GENRES[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = storyCreateSchema.safeParse({ slug, title: { ru: titleRu }, genre });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте введённые данные");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/admin/stories", { method: "POST", body: JSON.stringify(parsed.data) });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать историю");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border border-neutral-200 bg-white p-4">
      <div>
        <label className="block text-sm text-neutral-600">Slug (латиница, дефисы)</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          placeholder="mask-and-word"
        />
      </div>
      <div>
        <label className="block text-sm text-neutral-600">Название</label>
        <input
          value={titleRu}
          onChange={(e) => setTitleRu(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm text-neutral-600">Жанр</label>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value as (typeof STORY_GENRES)[number])}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        >
          {STORY_GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={submitting} className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        {submitting ? "Создаём…" : "Создать"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `lint` - clean.

Manual check: log in, land on `/stories` (empty list first run, or shows the seeded
`mask-and-word` demo story). Click "Создать историю", fill slug/title/genre, submit ->
new story appears in the list without a page reload. Try submitting an invalid slug (e.g.
with a space) -> inline validation error from `storyCreateSchema`, no network request made.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/lib/types.ts apps/admin/app/\(app\)/stories
git commit -m "feat(admin): stories list and create form"
```

---

## Task 5: Story detail — seasons/chapters

**Files:**
- Create: `apps/admin/app/(app)/stories/[id]/page.tsx`

**Interfaces:**
- Consumes: `StoryDetailOut`, `SeasonOut`, `ChapterOut` (Task 4's `lib/types.ts`),
  `seasonCreateSchema`, `chapterCreateSchema` (`@arcana/shared`)
- Produces: nothing new consumed by later tasks - Task 6 adds a characters section to this
  same page rather than a separate route (a story's characters and its seasons are both
  "things you manage on this one story", matching how an author actually thinks about it).

- [ ] **Step 1: Story detail page — seasons and chapters, publish/unpublish/delete**

`apps/admin/app/(app)/stories/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { seasonCreateSchema, chapterCreateSchema } from "@arcana/shared";

import { apiRequest, ApiError } from "@/lib/api";
import type { StoryDetailOut } from "@/lib/types";

export default function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [story, setStory] = useState<StoryDetailOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setStory(await apiRequest<StoryDetailOut>(`/admin/stories/${id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить историю");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onDeleteStory = async () => {
    if (!confirm("Удалить историю целиком? Это необратимо.")) return;
    await apiRequest(`/admin/stories/${id}`, { method: "DELETE" });
    router.replace("/stories");
  };

  const onTogglePublish = async () => {
    if (!story) return;
    const action = story.status === "PUBLISHED" ? "unpublish" : "publish";
    await apiRequest(`/admin/stories/${id}/${action}`, { method: "POST" });
    load();
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!story) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{story.title.ru}</h1>
          <p className="text-sm text-neutral-500">
            {story.slug} · {story.genre} · {story.status}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onTogglePublish} className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {story.status === "PUBLISHED" ? "Снять с публикации" : "Опубликовать"}
          </button>
          <button onClick={onDeleteStory} className="rounded border border-red-300 px-3 py-2 text-sm text-red-600">
            Удалить
          </button>
        </div>
      </div>

      <SeasonsSection storyId={story.id} seasons={story.seasons} onChanged={load} />
    </div>
  );
}

function SeasonsSection({
  storyId,
  seasons,
  onChanged,
}: {
  storyId: string;
  seasons: StoryDetailOut["seasons"];
  onChanged: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [index, setIndex] = useState(seasons.length + 1);
  const [titleRu, setTitleRu] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = seasonCreateSchema.safeParse({ storyId, index, title: { ru: titleRu } });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте данные");
      return;
    }
    try {
      await apiRequest("/admin/seasons", { method: "POST", body: JSON.stringify(parsed.data) });
      setShowCreate(false);
      setTitleRu("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать сезон");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Сезоны</h2>
        <button onClick={() => setShowCreate((v) => !v)} className="text-sm text-neutral-600 underline">
          {showCreate ? "Отмена" : "Добавить сезон"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={onCreateSeason} className="flex items-end gap-3 rounded border border-neutral-200 bg-white p-4">
          <div>
            <label className="block text-sm text-neutral-600">Номер</label>
            <input
              type="number"
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              className="mt-1 w-20 rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-neutral-600">Название</label>
            <input
              value={titleRu}
              onChange={(e) => setTitleRu(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">
            Создать
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {seasons.map((season) => (
        <ChaptersList key={season.id} season={season} onChanged={onChanged} />
      ))}
    </section>
  );
}

function ChaptersList({ season, onChanged }: { season: StoryDetailOut["seasons"][number]; onChanged: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [index, setIndex] = useState(season.chapters.length + 1);
  const [titleRu, setTitleRu] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = chapterCreateSchema.safeParse({ seasonId: season.id, index, title: { ru: titleRu } });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте данные");
      return;
    }
    try {
      await apiRequest("/admin/chapters", { method: "POST", body: JSON.stringify(parsed.data) });
      setShowCreate(false);
      setTitleRu("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать главу");
    }
  };

  const onToggleChapterPublish = async (chapter: StoryDetailOut["seasons"][number]["chapters"][number]) => {
    const action = chapter.status === "PUBLISHED" ? "unpublish" : "publish";
    await apiRequest(`/admin/chapters/${chapter.id}/${action}`, { method: "POST" });
    onChanged();
  };

  return (
    <div className="rounded border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium">
          Сезон {season.index}: {season.title.ru}
        </h3>
        <button onClick={() => setShowCreate((v) => !v)} className="text-sm text-neutral-600 underline">
          {showCreate ? "Отмена" : "Добавить главу"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={onCreateChapter} className="mb-3 flex items-end gap-3 rounded border border-neutral-200 p-3">
          <div>
            <label className="block text-sm text-neutral-600">Номер</label>
            <input
              type="number"
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              className="mt-1 w-20 rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-neutral-600">Название</label>
            <input
              value={titleRu}
              onChange={(e) => setTitleRu(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">
            Создать
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      <ul className="divide-y divide-neutral-100">
        {season.chapters.map((chapter) => (
          <li key={chapter.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              Глава {chapter.index}: {chapter.title.ru} · {chapter.status}
            </span>
            <button onClick={() => onToggleChapterPublish(chapter)} className="text-neutral-600 underline">
              {chapter.status === "PUBLISHED" ? "Снять с публикации" : "Опубликовать"}
            </button>
          </li>
        ))}
        {season.chapters.length === 0 && <li className="py-2 text-sm text-neutral-500">Пока нет глав</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `lint` - clean.

Manual check: click into a story from the list, add a season, add a chapter to it, publish
the chapter (status flips to `PUBLISHED`), publish the story itself, delete a story you don't
need (confirms and redirects back to the list).

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/(app)/stories/[id]"
git commit -m "feat(admin): story detail - seasons, chapters, publish/delete"
```

---

## Task 6: Characters + sprite/cover upload

**Files:**
- Create: `apps/admin/components/ImageUpload.tsx`
- Modify: `apps/admin/app/(app)/stories/[id]/page.tsx` (add a characters section + wire the
  cover-image upload into the story header)

**Interfaces:**
- Consumes: `apiRequest` with `formData: true` (Task 2), `characterCreateSchema`
  (`@arcana/shared`), `POST /admin/uploads` (backend, already built and tested)
- Produces: `<ImageUpload onUploaded={(url) => void} />` - a reusable widget; this plan's
  last task, no further consumers within this plan, but the future scene-editor plan (sprite
  matrix, backgrounds) reuses it.

- [ ] **Step 1: The upload widget**

`apps/admin/components/ImageUpload.tsx`:

```tsx
"use client";

import { useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";

type UploadOut = { url: string };

/** Uploads a single image file to POST /admin/uploads and reports the resulting URL back to
 * the caller. Stateless about what the URL is used for (cover, sprite, background) - the
 * caller decides where it goes. */
export function ImageUpload({
  label,
  currentUrl,
  onUploaded,
}: {
  label: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest<UploadOut>("/admin/uploads", {
        method: "POST",
        body: formData,
        formData: true,
      });
      onUploaded(result.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить файл");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm text-neutral-600">{label}</label>
      {currentUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded-file URLs, not a static local asset next/image can optimize
        <img src={currentUrl} alt="" className="h-24 w-24 rounded border border-neutral-300 object-cover" />
      )}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} disabled={uploading} className="text-sm" />
      {uploading && <p className="text-sm text-neutral-500">Загрузка…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire cover upload into the story header**

In `apps/admin/app/(app)/stories/[id]/page.tsx`, add the import:

```tsx
import { ImageUpload } from "@/components/ImageUpload";
```

Also extend the existing `@arcana/shared` import line (currently
`import { seasonCreateSchema, chapterCreateSchema } from "@arcana/shared";`, added in Task 5)
to include `characterCreateSchema`, needed by `CharactersSection` in Step 3 below:

```tsx
import { seasonCreateSchema, chapterCreateSchema, characterCreateSchema } from "@arcana/shared";
```

Add a handler inside `StoryDetailPage` (alongside `onDeleteStory`/`onTogglePublish`):

```tsx
  const onCoverUploaded = async (url: string) => {
    await apiRequest(`/admin/stories/${id}`, { method: "PATCH", body: JSON.stringify({ coverImageUrl: url }) });
    load();
  };
```

Add the widget into the JSX, right after the header `<div className="flex items-center justify-between">...</div>` block and before `<SeasonsSection ...>`:

```tsx
      <ImageUpload label="Обложка" currentUrl={story.coverImageUrl} onUploaded={onCoverUploaded} />
```

- [ ] **Step 3: Characters section**

Add this component to the same file, and render it in `StoryDetailPage`'s JSX right after
`<SeasonsSection ... />`:

```tsx
      <CharactersSection storyId={story.id} characters={story.characters} onChanged={load} />
```

```tsx
function CharactersSection({
  storyId,
  characters,
  onChanged,
}: {
  storyId: string;
  characters: StoryDetailOut["characters"];
  onChanged: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [nameRu, setNameRu] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = characterCreateSchema.safeParse({ storyId, name: { ru: nameRu } });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте данные");
      return;
    }
    try {
      await apiRequest("/admin/characters", { method: "POST", body: JSON.stringify(parsed.data) });
      setShowCreate(false);
      setNameRu("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать персонажа");
    }
  };

  const onSpriteUploaded = async (character: StoryDetailOut["characters"][number], expression: string, url: string) => {
    const sprites = { ...character.sprites, [expression]: url };
    await apiRequest(`/admin/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ sprites }) });
    onChanged();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Персонажи</h2>
        <button onClick={() => setShowCreate((v) => !v)} className="text-sm text-neutral-600 underline">
          {showCreate ? "Отмена" : "Добавить персонажа"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={onCreateCharacter} className="flex items-end gap-3 rounded border border-neutral-200 bg-white p-4">
          <div className="flex-1">
            <label className="block text-sm text-neutral-600">Имя</label>
            <input
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">
            Создать
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      <div className="grid grid-cols-2 gap-4">
        {characters.map((character) => (
          <div key={character.id} className="rounded border border-neutral-200 bg-white p-4">
            <p className="mb-2 font-medium" style={{ color: character.nameColor }}>
              {character.name.ru}
            </p>
            <ImageUpload
              label='Спрайт "neutral"'
              currentUrl={character.sprites.neutral}
              onUploaded={(url) => onSpriteUploaded(character, "neutral", url)}
            />
          </div>
        ))}
        {characters.length === 0 && <p className="text-sm text-neutral-500">Пока нет персонажей</p>}
      </div>
    </section>
  );
}
```

(One sprite slot - `"neutral"` - is enough to prove the upload path end-to-end for this
plan. The future scene-editor plan replaces this with the full expression×outfit matrix
uploader the spec describes.)

- [ ] **Step 4: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `lint` - clean.

Manual check: on a story's detail page, upload a cover image (file picker -> preview appears
-> story record updated, confirm by reloading the page and seeing the same cover persist).
Add a character, upload its "neutral" sprite the same way. Open the uploaded image URL
directly in a new browser tab - confirms `apps/api`'s static `/uploads` mount actually serves
it (this exercises the full backend chain from Task 5 of the backend plan, now driven from a
real UI instead of `curl`).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/ImageUpload.tsx "apps/admin/app/(app)/stories/[id]/page.tsx"
git commit -m "feat(admin): characters CRUD with cover/sprite image upload"
```

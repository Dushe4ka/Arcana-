# Player Cabinet Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `apps/cabinet` website (Next.js) and the `apps/mobile` entry point so a
player on iPhone/Android can leave the app into the system browser, land on a cabinet session
without a second login, view their wallet + story stats, and buy HARD currency through
YooKassa.

**Architecture:** New `apps/cabinet` Next.js (App Router) app, stack identical to `apps/admin`.
Session tokens live in httpOnly cookies set server-side; a `proxy.ts` (Next 16's renamed
middleware) keeps the access token fresh before every request, so server components and route
handlers just read the cookie. Data pages are server components calling the existing backend
directly; the two client interactions that need the token (checkout, wallet polling) go through
thin same-origin route handlers. The mobile side adds a `lib/cabinet.ts` helper that fetches a
one-time code and opens the browser.

**Tech Stack:** Next.js 16.3.4, React 19, Tailwind CSS 4, `@arcana/shared` (workspace),
TypeScript. Backend already built (FastAPI, `apps/api`). Mobile: Expo 54 / React Native,
`expo-linking`.

**Spec:** `docs/superpowers/specs/2026-09-06-player-cabinet-design.md` — read it first. The
backend half (link-token, `/me/stats`, YooKassa purchases, webhook) is already implemented and
tested on branch `player-cabinet-backend`; this plan builds only the site and the mobile
entry point.

## Global Constraints

- **All user-facing copy is Russian.** Match the tone of `apps/mobile` and `apps/admin`
  (informal «вы», short).
- **Money is integer kopecks end to end.** `price_rub_kopecks` from the backend is an `int`;
  format for display as `` `${(kopecks / 100).toLocaleString("ru-RU")} ₽` `` at the render
  point only. Never do arithmetic on a rubles float.
- **Session tokens never touch client JavaScript.** Access/refresh JWTs live only in httpOnly
  cookies. Client components that need backend data call a same-origin route handler; they
  never receive a token.
- **`apps/cabinet` has no unit-test runner** — same as `apps/admin` (which ships zero tests).
  Frontend verification for every cabinet task is:
  `pnpm --filter @arcana/cabinet typecheck && pnpm --filter @arcana/cabinet lint && pnpm --filter @arcana/cabinet build`
  plus a live walkthrough with the `orca` skill against a running backend + seeded data.
  Do **not** add vitest/jest/playwright to this app. Backend changes (`apps/api/seed.py`)
  **do** get a `pytest` test — that harness exists.
- **This is Next.js 16, not older Next.** Before writing any Next-specific file, read the
  matching doc under `apps/cabinet/node_modules/next/dist/docs/` (resolved from that dir, not
  the repo root). Known rename this plan already accounts for: `middleware.ts` → **`proxy.ts`**
  (root-level, exports `proxy` + `config`). `cookies()` from `next/headers` is **async**
  (`await cookies()`).
- **Follow `apps/admin` conventions exactly:** `tsconfig.json` `paths` alias `@/*`, `lib/`
  for non-component modules, `components/` for components, `app/` App Router, the `ApiError`
  shape and error-envelope parsing from `apps/admin/lib/api.ts`, `.env*` gitignored except
  `.env.local.example`.
- **Visual work goes through the design skills** (per repo CLAUDE.md): before writing any
  page/component in Tasks 5–8, run `Skill frontend-design` and
  `python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ...` for
  fonts/palette/patterns; after implementing a screen and before marking the task done, run
  `Skill critique` then `Skill polish`. Name in the task notes which skills ran and what they
  changed.
- **Design language:** dark, romantic-mystical, matching `apps/mobile`. Reuse the palette
  values from `apps/mobile/lib/theme.ts` (`background #1a1613`, `surface #241f1a`,
  `surfaceRaised #2f2820`, `border #4a3f30`, `text #f3ece0`, `textMuted #b8a99a`,
  `accent #d4af6a`, `soft #7fc9c0` for coins, `hard #d4af6a` for crystals, `danger #e08585`).
  Headline face: Playfair Display (600/700) via `next/font/google`; body: Inter or system.
- **Backend base URL** is server-only env `API_BASE_URL` (default `http://localhost:4000/api`).
  Never expose it as `NEXT_PUBLIC_*` — the browser never calls the backend directly.
- **Commit after every task** with a `feat(cabinet):` / `feat(mobile):` / `chore(cabinet):`
  prefix. End every commit message with the two trailer lines:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV`.

---

### Task 1: Scaffold `apps/cabinet`

**Files:**
- Create: `apps/cabinet/package.json`
- Create: `apps/cabinet/tsconfig.json`
- Create: `apps/cabinet/next.config.ts`
- Create: `apps/cabinet/postcss.config.mjs`
- Create: `apps/cabinet/eslint.config.mjs`
- Create: `apps/cabinet/.gitignore`
- Create: `apps/cabinet/.env.local.example`
- Create: `apps/cabinet/next-env.d.ts`
- Create: `apps/cabinet/app/layout.tsx`
- Create: `apps/cabinet/app/globals.css`
- Create: `apps/cabinet/app/page.tsx` (temporary placeholder, replaced in Task 5)
- Create: `apps/cabinet/README.md`

**Interfaces:**
- Consumes: root pnpm workspace (`pnpm-workspace.yaml` already globs `apps/*`), Turborepo
  (`turbo.json` already defines `build`/`lint`/`dev`/`typecheck`).
- Produces: a workspace package `@arcana/cabinet` with scripts `dev` (port 3100), `build`,
  `start` (port 3100), `lint`, `typecheck`. Nothing else in this plan works until this exists.

- [ ] **Step 1: Create `apps/cabinet/package.json`**

Copy `apps/admin/package.json`, then: change `name` to `@arcana/cabinet`, drop the
`@xyflow/react` and `zustand` dependencies (cabinet needs neither), pin `dev`/`start` to port
3100.

```json
{
  "name": "@arcana/cabinet",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start -p 3100",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arcana/shared": "workspace:*",
    "next": "16.3.4",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.4",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Copy the config files verbatim from `apps/admin`**

These are identical to `apps/admin` — copy their exact contents:
- `apps/cabinet/tsconfig.json` ← `apps/admin/tsconfig.json`
- `apps/cabinet/postcss.config.mjs` ← `apps/admin/postcss.config.mjs`
- `apps/cabinet/eslint.config.mjs` ← `apps/admin/eslint.config.mjs`
- `apps/cabinet/.gitignore` ← `apps/admin/.gitignore`

Create `apps/cabinet/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

Create `apps/cabinet/next-env.d.ts` (Next regenerates it, but the file must exist for the
first typecheck):

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

- [ ] **Step 3: Create `apps/cabinet/.env.local.example`**

```bash
# Backend API base URL, including /api. Server-only (the browser never calls the backend
# directly). Defaults to http://localhost:4000/api if unset.
API_BASE_URL="http://localhost:4000/api"

# Set to "true" in any HTTPS deployment so session cookies get the Secure flag.
# Leave "false" for local http://localhost development.
COOKIE_SECURE="false"
```

- [ ] **Step 4: Create `apps/cabinet/app/globals.css`**

```css
@import "tailwindcss";

:root {
  --background: #1a1613;
  --surface: #241f1a;
  --surface-raised: #2f2820;
  --border: #4a3f30;
  --text: #f3ece0;
  --text-muted: #b8a99a;
  --accent: #d4af6a;
  --coin: #7fc9c0;
  --crystal: #d4af6a;
  --danger: #e08585;
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-border: var(--border);
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-accent: var(--accent);
  --color-coin: var(--coin);
  --color-crystal: var(--crystal);
  --color-danger: var(--danger);
}

body {
  background: var(--background);
  color: var(--text);
}
```

- [ ] **Step 5: Create `apps/cabinet/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Личный кабинет — Arcana",
  description: "Баланс, статистика и покупка кристаллов Arcana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${playfair.variable} h-full`}>
      <body className="min-h-full bg-background text-text antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Create the placeholder `apps/cabinet/app/page.tsx`**

```tsx
export default function Home() {
  return <main className="p-8 text-text-muted">Личный кабинет Arcana</main>;
}
```

- [ ] **Step 7: Create `apps/cabinet/README.md`**

```markdown
# @arcana/cabinet — Личный кабинет игрока

Отдельный сайт (Next.js, App Router), куда мобильное приложение уводит игрока для просмотра
статистики и покупки HARD-валюты через ЮKassa. Вход только по одноразовому коду из приложения
(`/auth/callback?code=...`), формы логина нет.

## Запуск

```bash
cp .env.local.example .env.local   # укажите API_BASE_URL вашего backend
pnpm --filter @arcana/cabinet dev  # http://localhost:3100
```

Backend (`apps/api`) должен быть запущен. Для сквозной проверки прогоните `python seed.py`
в `apps/api` — он создаёт демо-игрока `player@arcana.app` с прогрессом.

## Архитектура

- Сессия — httpOnly cookie (`arcana_cab_at` / `arcana_cab_rt`), выставляет серверный код.
- `proxy.ts` обновляет access-токен перед каждым запросом; страницы и route handler'ы просто
  читают cookie.
- Страницы с данными — server components, ходят в backend напрямую.
- `/api/checkout` и `/api/wallet` — тонкие same-origin route handler'ы для клиентских кнопок.
```

- [ ] **Step 8: Install and verify**

```bash
cd /Users/pavelgolubinec/Desktop/MyProjects/Startaps/Arcana-
pnpm install
pnpm --filter @arcana/cabinet typecheck
pnpm --filter @arcana/cabinet lint
pnpm --filter @arcana/cabinet build
```

Expected: all three pass. `pnpm install` adds `apps/cabinet` to the workspace lockfile.
If `next build` complains about `next-env.d.ts`, let Next rewrite it and re-run — do not
hand-fix.

- [ ] **Step 9: Smoke-run the dev server**

```bash
pnpm --filter @arcana/cabinet dev
```

Open `http://localhost:3100` — expect "Личный кабинет Arcana" on the dark background. Stop
the server.

- [ ] **Step 10: Commit**

```bash
git add apps/cabinet pnpm-lock.yaml
git commit -m "feat(cabinet): scaffold apps/cabinet (Next.js 16 + Tailwind 4, port 3100)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 2: Seed a demo player with progress (backend)

**Files:**
- Modify: `apps/api/seed.py` (add `seed_cabinet_demo`, call it from `main`)
- Create: `apps/api/tests/test_seed_cabinet_demo.py`

**Interfaces:**
- Consumes: existing `seed_demo_story` (runs first, creates story `mask-and-word` with
  variables `confidence`, `relationship`@Dante, `relationship`@Lia), models `User`, `Wallet`,
  `PlayerProfile`, `DailyRewardState` (`app.models.economy` / `app.models.user`),
  `SaveSlot`, `PlayerVariableValue` (`app.models.player`), `VariableDefinition`, `Character`,
  `Story` (`app.models.content`), `hash_password` (`app.core.security`).
- Produces: after `python seed.py`, a `PLAYER` user `player@arcana.app` / `Player123!` with a
  wallet (200 hard, 500 soft), a `SaveSlot` on `mask-and-word`, and `PlayerVariableValue`
  rows so `GET /me/stats` returns one `StoryStatsOut` with 2 relationships + 1 general.
  Tasks 4–8's live `orca` walkthroughs log in as this user (via a link token).

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/test_seed_cabinet_demo.py`. The test harness (`tests/conftest.py`)
provides `db_session` (transactional `AsyncSession`) and `client` (an `httpx` client with
`app.dependency_overrides` pointed at `db_session`). Look at an existing test
(`tests/test_stats.py`) for the exact fixture names and auth helper before writing this.

```python
import pytest
from sqlalchemy import select

from app.models.user import User
from seed import seed_cabinet_demo, seed_demo_story


@pytest.mark.asyncio
async def test_seed_cabinet_demo_creates_player_with_stats(db_session):
    await seed_demo_story(db_session)
    await seed_cabinet_demo(db_session)

    user = await db_session.scalar(select(User).where(User.email == "player@arcana.app"))
    assert user is not None
    assert user.role.value == "PLAYER"

    # Running it twice must not raise (idempotent) and must not duplicate the user.
    await seed_cabinet_demo(db_session)
    users = list(await db_session.scalars(select(User).where(User.email == "player@arcana.app")))
    assert len(users) == 1


@pytest.mark.asyncio
async def test_seeded_player_stats_endpoint(db_session, client):
    await seed_demo_story(db_session)
    await seed_cabinet_demo(db_session)
    await db_session.commit()

    login = await client.post(
        "/api/auth/login",
        json={"email": "player@arcana.app", "password": "Player123!"},
    )
    assert login.status_code == 200
    token = login.json()["accessToken"]

    res = await client.get("/api/me/stats", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    stories = res.json()
    assert len(stories) == 1
    assert len(stories[0]["relationships"]) == 2
    assert len(stories[0]["general"]) == 1
```

- [ ] **Step 2: Run it, verify it fails**

```bash
cd apps/api && source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_seed_cabinet_demo.py -v
```

Expected: FAIL — `ImportError: cannot import name 'seed_cabinet_demo' from 'seed'`.

- [ ] **Step 3: Implement `seed_cabinet_demo`**

In `apps/api/seed.py`, add these imports if missing (`SaveSlot`, `PlayerVariableValue` from
`app.models.player`) and add the function. Keep the existing module style (plain `async def`,
`db.add`, `await db.flush()` / `await db.commit()`, `print(...)` at the end).

```python
async def seed_cabinet_demo(db):
    """A PLAYER account with real progress so the player cabinet site has something to show:
    wallet balance, a save slot on the demo story, and a few variable values that GET /me/stats
    turns into 2 relationship bars + 1 general stat. seed_demo_story deletes and recreates the
    story on every run (cascading away this slot/values), so this always re-creates them."""
    email = "player@arcana.app"
    user = await db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(email=email, password_hash=hash_password("Player123!"), role="PLAYER")
        db.add(user)
        await db.flush()
        db.add(PlayerProfile(user_id=user.id, display_name="Демо Игрок"))
        db.add(DailyRewardState(user_id=user.id))

    wallet = await db.scalar(select(Wallet).where(Wallet.user_id == user.id))
    if not wallet:
        wallet = Wallet(user_id=user.id)
        db.add(wallet)
    wallet.soft = 500
    wallet.hard = 200

    story = await db.scalar(select(Story).where(Story.slug == "mask-and-word"))
    if story is None:
        print("seed_cabinet_demo: demo story missing, run seed_demo_story first — skipping")
        return

    first_chapter = await db.scalar(
        select(Chapter)
        .join(Season, Chapter.season_id == Season.id)
        .where(Season.story_id == story.id)
        .order_by(Season.index, Chapter.index)
        .limit(1)
    )

    # Rebuild the save slot from scratch (cascade may have removed the old one).
    await db.execute(
        delete(SaveSlot).where(SaveSlot.user_id == user.id, SaveSlot.story_id == story.id)
    )
    db.add(
        SaveSlot(
            user_id=user.id,
            story_id=story.id,
            slot_index=1,
            chapter_id=first_chapter.id if first_chapter else None,
        )
    )

    defs = list(
        await db.scalars(select(VariableDefinition).where(VariableDefinition.story_id == story.id))
    )
    demo_values = {}
    for d in defs:
        if d.character_id is not None:
            character = await db.get(Character, d.character_id)
            name_ru = (character.name or {}).get("ru", "") if character else ""
            demo_values[d.id] = 40 if "Данте" in name_ru else 15
        elif d.key == "confidence":
            demo_values[d.id] = 3

    await db.execute(delete(PlayerVariableValue).where(PlayerVariableValue.user_id == user.id))
    for def_id, value in demo_values.items():
        db.add(
            PlayerVariableValue(user_id=user.id, variable_definition_id=def_id, value=value)
        )

    await db.commit()
    print(f"Cabinet demo player ready: {email} / Player123!")
```

Check that `delete` is imported at the top of `seed.py` (from `sqlalchemy`); add it to the
import if not.

- [ ] **Step 4: Wire it into `main()`**

```python
async def main():
    async with SessionLocal() as db:
        await seed_admin_user(db)
        await seed_demo_story(db)
        await seed_cabinet_demo(db)
    print("Seed complete.")
```

- [ ] **Step 5: Run the tests, verify they pass**

```bash
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_seed_cabinet_demo.py -v
```

Expected: both PASS.

- [ ] **Step 6: Run the full backend suite + lint**

```bash
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest
ruff check app seed.py && ruff format --check app seed.py
```

Expected: all green (36+ tests). If `ruff format --check` fails, run `ruff format app seed.py`
and re-check.

- [ ] **Step 7: Commit**

```bash
git add apps/api/seed.py apps/api/tests/test_seed_cabinet_demo.py
git commit -m "feat(api): seed a demo PLAYER with wallet + progress for the cabinet site

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 3: Session plumbing — cookies, proxy, server API client

**Files:**
- Create: `apps/cabinet/lib/env.ts`
- Create: `apps/cabinet/lib/session.ts`
- Create: `apps/cabinet/lib/api.ts`
- Create: `apps/cabinet/proxy.ts`
- Create: `apps/cabinet/app/session-expired/page.tsx`

**Interfaces:**
- Consumes: backend `POST /auth/refresh` (`{refreshToken}` → `{accessToken, refreshToken}`),
  env `API_BASE_URL`, `COOKIE_SECURE`.
- Produces:
  - `lib/session.ts`: `AT_COOKIE = "arcana_cab_at"`, `RT_COOKIE = "arcana_cab_rt"`,
    `cookieOptions(): { httpOnly; secure; sameSite: "lax"; path: "/" }`,
    `jwtExpired(token: string, skewSeconds?: number): boolean`.
  - `lib/api.ts`: `class ApiError extends Error { status; issues? }`,
    `serverFetch<T>(path: string, init?: RequestInit): Promise<T>` (reads `AT_COOKIE` via
    `await cookies()`, throws `ApiError` on non-2xx),
    `fetchOrExpire<T>(path, init?): Promise<T>` (calls `serverFetch`, and on `ApiError` with
    status 401 calls `redirect("/session-expired")`).
  - `proxy.ts`: default-exported `proxy` that guarantees a fresh `AT_COOKIE` for every matched
    route, or redirects to `/session-expired`.
  - Route `/session-expired`.

- [ ] **Step 1: Read the Next 16 docs for the APIs this task uses**

```bash
ls apps/cabinet/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
cat apps/cabinet/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
cat apps/cabinet/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md
```

Confirm: `proxy.ts` is root-level, exports `proxy` (named or default) + optional `config`;
`request.cookies.get/getAll`, `NextResponse.next()` then `response.cookies.set(...)`;
`cookies()` from `next/headers` is `async`.

- [ ] **Step 2: Create `apps/cabinet/lib/env.ts`**

```ts
export function apiBaseUrl(): string {
  return (process.env.API_BASE_URL || "http://localhost:4000/api").replace(/\/$/, "");
}

export function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "true";
}
```

- [ ] **Step 3: Create `apps/cabinet/lib/session.ts`**

```ts
import { cookieSecure } from "./env";

export const AT_COOKIE = "arcana_cab_at";
export const RT_COOKIE = "arcana_cab_rt";

/** Shared attributes for both session cookies. `maxAge` is set per-cookie by the caller. */
export function cookieOptions() {
  return { httpOnly: true, secure: cookieSecure(), sameSite: "lax" as const, path: "/" };
}

/** Decode a JWT payload (no signature check — the backend verifies) and report whether it is
 * expired, treating anything within `skewSeconds` of expiry as already expired so the proxy
 * refreshes a hair early instead of racing the backend. Returns true for an unparseable token. */
export function jwtExpired(token: string, skewSeconds = 15): boolean {
  try {
    const [, payload] = token.split(".");
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof json.exp !== "number") return true;
    return json.exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return true;
  }
}
```

- [ ] **Step 4: Create `apps/cabinet/lib/api.ts`**

```ts
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
    throw new ApiError(
      res.status,
      body?.message ?? `Ошибка сервера (${res.status})`,
      body?.issues,
    );
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
```

- [ ] **Step 5: Create `apps/cabinet/proxy.ts`**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiBaseUrl } from "./lib/env";
import { AT_COOKIE, RT_COOKIE, cookieOptions, jwtExpired } from "./lib/session";

// Run on every route EXCEPT the ones that must work without a session, and static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|session-expired|auth/callback).*)"],
};

const ACCESS_MAX_AGE = 60 * 20; // cookie lifespan cap; the JWT's own exp is the real gate
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

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

  if (!pair) return redirectExpired(request);

  const response = NextResponse.next();
  response.cookies.set(AT_COOKIE, pair.accessToken, { ...cookieOptions(), maxAge: ACCESS_MAX_AGE });
  response.cookies.set(RT_COOKIE, pair.refreshToken, { ...cookieOptions(), maxAge: REFRESH_MAX_AGE });
  return response;
}

function redirectExpired(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/session-expired", request.url));
  response.cookies.delete(AT_COOKIE);
  response.cookies.delete(RT_COOKIE);
  return response;
}
```

- [ ] **Step 6: Create `apps/cabinet/app/session-expired/page.tsx`**

```tsx
export default function SessionExpired() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-text">
        Ссылка недействительна
      </h1>
      <p className="text-text-muted">
        Одноразовая ссылка входа истекла или уже была использована. Откройте личный кабинет в
        приложении Arcana ещё раз — оно выдаст новую.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Verify**

```bash
pnpm --filter @arcana/cabinet typecheck
pnpm --filter @arcana/cabinet lint
pnpm --filter @arcana/cabinet build
```

Expected: all pass. Then `pnpm --filter @arcana/cabinet dev` and open
`http://localhost:3100/` with no cookies set → you should be redirected to
`/session-expired`. Open `http://localhost:3100/session-expired` directly → renders. Stop the
server.

- [ ] **Step 8: Commit**

```bash
git add apps/cabinet
git commit -m "feat(cabinet): httpOnly-cookie session, proxy token refresh, server API client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 4: `/auth/callback` — deeplink code exchange

**Files:**
- Create: `apps/cabinet/app/auth/callback/route.ts`

**Interfaces:**
- Consumes: backend `POST /auth/cabinet-exchange` (`{code}` → `AuthResponse` =
  `{accessToken, refreshToken, user}`), `lib/session.ts` (`AT_COOKIE`, `RT_COOKIE`,
  `cookieOptions`), `apiBaseUrl()`.
- Produces: route `GET /auth/callback?code=<code>&next=<path>` — on success sets both session
  cookies and `redirect`s to a safe `next` path (default `/`); on any failure `redirect`s to
  `/session-expired`. This is the ONLY way a session is established.

- [ ] **Step 1: Create `apps/cabinet/app/auth/callback/route.ts`**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { apiBaseUrl } from "@/lib/env";
import { AT_COOKIE, RT_COOKIE, cookieOptions } from "@/lib/session";

const SAFE_NEXT = new Set(["/", "/shop", "/stats", "/wallet"]);
const ACCESS_MAX_AGE = 60 * 20;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next");
  const next = nextParam && SAFE_NEXT.has(nextParam) ? nextParam : "/";

  const expired = new URL("/session-expired", request.url);
  if (!code) return NextResponse.redirect(expired);

  let pair: { accessToken: string; refreshToken: string } | null = null;
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/cabinet-exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
    if (res.ok) pair = await res.json();
  } catch {
    // fall through
  }

  if (!pair) return NextResponse.redirect(expired);

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(AT_COOKIE, pair.accessToken, { ...cookieOptions(), maxAge: ACCESS_MAX_AGE });
  response.cookies.set(RT_COOKIE, pair.refreshToken, { ...cookieOptions(), maxAge: REFRESH_MAX_AGE });
  return response;
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @arcana/cabinet typecheck && pnpm --filter @arcana/cabinet lint && pnpm --filter @arcana/cabinet build
```

- [ ] **Step 3: Live end-to-end handshake test with `orca`**

Start the backend and seed it:

```bash
cd apps/api && source .venv/bin/activate
alembic upgrade head && python seed.py
uvicorn app.main:asgi_app --reload --port 4000
```

In another shell, mint a link token for the demo player by logging in as them and calling the
endpoint (this stands in for what the mobile app will do in Task 9):

```bash
TOKEN=$(curl -s localhost:4000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"player@arcana.app","password":"Player123!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
curl -s localhost:4000/api/auth/cabinet-link-token -X POST -H "Authorization: Bearer $TOKEN"
# => {"code":"...","expiresInSeconds":60}
```

Run `pnpm --filter @arcana/cabinet dev`. Use the `orca` skill to drive the browser to
`http://localhost:3100/auth/callback?code=<code>&next=/` within 60s. Expected:
- redirected to `/` (placeholder page still — real page is Task 5)
- browser devtools shows `arcana_cab_at` + `arcana_cab_rt` cookies, both `HttpOnly`
- reloading `/` stays on `/` (proxy sees a valid token), does NOT bounce to `/session-expired`
- re-visiting the same `callback?code=...` URL a second time → redirected to `/session-expired`
  (code already used)

Record the `orca` walkthrough result in the task notes.

- [ ] **Step 4: Commit**

```bash
git add apps/cabinet
git commit -m "feat(cabinet): /auth/callback one-time-code exchange into a cookie session

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 5: App shell + Home page (`/`) — wallet balance

**Files:**
- Create: `apps/cabinet/lib/types.ts`
- Create: `apps/cabinet/lib/format.ts`
- Create: `apps/cabinet/components/AppShell.tsx`
- Create: `apps/cabinet/components/BalanceCard.tsx`
- Modify: `apps/cabinet/app/page.tsx` (replace placeholder)
- Create: `apps/cabinet/app/loading.tsx`

**Interfaces:**
- Consumes: `fetchOrExpire` (`lib/api.ts`), backend `GET /wallet` → `WalletOut`.
- Produces:
  - `lib/types.ts`: `WalletView` (`{ soft: number; hard: number; energy: number; level: number;
    xpIntoLevel: number; xpForNextLevel: number }`), `StoryStatsView`, `RelationshipStatView`,
    `GeneralStatView`, `PackageView` (`{ id: string; currency: string; amount: number;
    priceRubKopecks: number }`) — hand-mirrored from `apps/api/app/schemas/*.py`, camelCase.
  - `lib/format.ts`: `rubles(kopecks: number): string`, `localized(text: Record<string,string>
    | string): string` (returns `text.ru` or the string).
  - `components/AppShell.tsx`: default export `AppShell({ active, children })` where
    `active: "home" | "stats" | "shop"` — the shared header (wordmark + nav to `/`, `/stats`,
    `/shop`) and the centered max-w container every page renders inside.
  - `components/BalanceCard.tsx`: `BalanceCard({ wallet }: { wallet: WalletView })`.
  - Route `/` renders `AppShell` + `BalanceCard` + a link into `/shop` and `/stats`.

- [ ] **Step 1: Design pass (skills)**

Run `Skill frontend-design` for the cabinet's visual direction (dark romantic-mystical, mobile
users arriving from the app — must feel continuous with it). Then:

```bash
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "premium dark gold accent balance wallet card" --domain style
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "Playfair Display Inter pairing" --domain typography
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "mobile-first single column app shell nav" --domain ux
```

Note in the task notes which pairing/pattern the data recommended and what you took from it.
The site is viewed mostly on phones (opened from the app) — design mobile-first, single
column, ~`max-w-md` content, generous touch targets (≥44px).

- [ ] **Step 2: Create `apps/cabinet/lib/types.ts`**

```ts
import type { LocalizedText } from "@arcana/shared";

export type WalletView = {
  soft: number;
  hard: number;
  energy: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
};

export type RelationshipStatView = {
  characterId: string;
  characterName: LocalizedText;
  characterNameColor: string;
  variableKey: string;
  label: LocalizedText;
  value: number | boolean | string;
  minValue: number | null;
  maxValue: number | null;
};

export type GeneralStatView = {
  variableKey: string;
  label: LocalizedText;
  value: number | boolean | string;
};

export type StoryStatsView = {
  storyId: string;
  storyTitle: LocalizedText;
  relationships: RelationshipStatView[];
  general: GeneralStatView[];
};

export type PackageView = {
  id: string;
  currency: string;
  amount: number;
  priceRubKopecks: number;
};
```

- [ ] **Step 3: Create `apps/cabinet/lib/format.ts`**

```ts
import type { LocalizedText } from "@arcana/shared";

export function rubles(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

export function localized(text: LocalizedText | string | null | undefined): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text.ru ?? Object.values(text)[0] ?? "";
}
```

- [ ] **Step 4: Create `components/AppShell.tsx`**

Server component. Header with the "ARCANA" wordmark in the display font and a 3-item nav
(`Баланс` → `/`, `Статистика` → `/stats`, `Кристаллы` → `/shop`), the `active` item
highlighted with `text-accent`. Content slot below in a `mx-auto max-w-md px-4 py-6` container.
Use `next/link`. Keep it to ~40 lines. Drive the exact spacing/type scale from the Step 1
design output.

- [ ] **Step 5: Create `components/BalanceCard.tsx`**

Server component. A `bg-surface rounded-[22px] p-6` card titled «Кошелёк» (display font) with
three stat columns — Монеты (`wallet.soft`, `text-coin`), Кристаллы (`wallet.hard`,
`text-crystal`), Энергия (`wallet.energy`, `text-text`) — mirroring `apps/mobile`'s profile
wallet row. Below the columns, a thin level bar: «Уровень {level}» and a
`wallet.xpIntoLevel / wallet.xpForNextLevel` progress track in `bg-accent`.

- [ ] **Step 6: Replace `apps/cabinet/app/page.tsx`**

```tsx
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { BalanceCard } from "@/components/BalanceCard";
import { fetchOrExpire } from "@/lib/api";
import type { WalletView } from "@/lib/types";

export default async function HomePage() {
  const wallet = await fetchOrExpire<WalletView>("/wallet");

  return (
    <AppShell active="home">
      <BalanceCard wallet={wallet} />
      <div className="mt-4 grid gap-3">
        <Link
          href="/shop"
          className="rounded-2xl bg-accent px-5 py-4 text-center font-semibold text-background"
        >
          Пополнить кристаллы
        </Link>
        <Link
          href="/stats"
          className="rounded-2xl border border-border px-5 py-4 text-center text-text"
        >
          Моя статистика по историям
        </Link>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 7: Create `apps/cabinet/app/loading.tsx`**

A minimal centered «Загрузка…» in `text-text-muted` (route-level Suspense fallback while the
server component fetches).

- [ ] **Step 8: Verify + critique + polish**

```bash
pnpm --filter @arcana/cabinet typecheck && pnpm --filter @arcana/cabinet lint && pnpm --filter @arcana/cabinet build
```

With the backend running + seeded and a fresh session (redo the Task 4 handshake), use `orca`
to open `/` as the demo player. Confirm: balance shows 500 / 200 / (energy), level bar
renders, both links navigate. Then run `Skill critique` on the screen, apply what it flags,
run `Skill polish`, apply. Record both skills' findings in the task notes.

- [ ] **Step 9: Commit**

```bash
git add apps/cabinet
git commit -m "feat(cabinet): app shell + home page with wallet balance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 6: Stats page (`/stats`)

**Files:**
- Create: `apps/cabinet/components/StatBar.tsx`
- Create: `apps/cabinet/components/StoryStatsSection.tsx`
- Create: `apps/cabinet/app/stats/page.tsx`

**Interfaces:**
- Consumes: `fetchOrExpire`, backend `GET /me/stats` → `StoryStatsView[]`, `localized`
  (`lib/format.ts`), types from `lib/types.ts`.
- Produces:
  - `components/StatBar.tsx`: `StatBar({ label, color, value, min, max })` — a labelled
    horizontal progress bar; when `min`/`max` are both numbers, fill =
    `(value - min) / (max - min)` clamped to `[0,1]`; otherwise render `value` as text with no
    bar.
  - `components/StoryStatsSection.tsx`: `StoryStatsSection({ story }: { story: StoryStatsView })`
    — story title (display font), then relationship `StatBar`s (bar color =
    `characterNameColor`), then a «Прочее» list of `general` stats (`label: value`).
  - Route `/stats`.

- [ ] **Step 1: Design pass (skills)**

```bash
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "relationship meter progress bar rpg stat" --domain ux
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "data list grouped sections mobile" --domain style
```

Relationship bars are the emotional centre of this page (this is a romance game) — they should
feel like character cards, not a settings screen. Note what the data suggested.

- [ ] **Step 2: Create `components/StatBar.tsx`**

Client-free (server component). Given `min`/`max` numbers, render a track
(`h-2 rounded-full bg-surface-raised`) with an inner fill `div` at
`width: ${pct}%` and `backgroundColor: color`. Label row above: name on the left
(`text-text`), `value` on the right (`text-text-muted`, e.g. `40 / 100`). If `min`/`max` are
null, drop the track and just show `label` + `String(value)`.

```tsx
type Props = {
  label: string;
  color: string;
  value: number | boolean | string;
  min: number | null;
  max: number | null;
};

export function StatBar({ label, color, value, min, max }: Props) {
  const numeric = typeof value === "number" && min !== null && max !== null && max > min;
  const pct = numeric
    ? Math.max(0, Math.min(1, ((value as number) - min!) / (max! - min!))) * 100
    : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text">{label}</span>
        <span className="text-xs text-text-muted">
          {numeric ? `${value} / ${max}` : String(value)}
        </span>
      </div>
      {pct !== null && (
        <div className="h-2 rounded-full bg-surface-raised">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `components/StoryStatsSection.tsx`**

Maps `story.relationships` → `<StatBar label={localized(r.label)} color={r.characterNameColor}
value={r.value} min={r.minValue} max={r.maxValue} />`, and `story.general` → a simple
`dl`/rows list under a «Прочее» subheading. Wrap in a `bg-surface rounded-[22px] p-6` card.
Hide the «Прочее» block when `general` is empty.

- [ ] **Step 4: Create `apps/cabinet/app/stats/page.tsx`**

```tsx
import { AppShell } from "@/components/AppShell";
import { StoryStatsSection } from "@/components/StoryStatsSection";
import { fetchOrExpire } from "@/lib/api";
import type { StoryStatsView } from "@/lib/types";

export default async function StatsPage() {
  const stories = await fetchOrExpire<StoryStatsView[]>("/me/stats");

  return (
    <AppShell active="stats">
      {stories.length === 0 ? (
        <p className="text-text-muted">
          Пока нет статистики — начните любую историю в приложении, и здесь появятся ваши
          отношения с персонажами.
        </p>
      ) : (
        <div className="grid gap-4">
          {stories.map((story) => (
            <StoryStatsSection key={story.storyId} story={story} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 5: Verify + critique + polish**

typecheck/lint/build, then `orca` walkthrough as the demo player: `/stats` shows «Маска и
Слово» with two relationship bars (Данте ~40/100 gold, Лия ~15/100 teal) and one general stat
(«Уверенность: 3»). Run `Skill critique`, apply, `Skill polish`, apply. Record findings.

- [ ] **Step 6: Commit**

```bash
git add apps/cabinet
git commit -m "feat(cabinet): stats page - relationship bars + general story variables

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 7: Shop (`/shop`) + checkout route handler

**Files:**
- Create: `apps/cabinet/app/api/checkout/route.ts`
- Create: `apps/cabinet/components/BuyButton.tsx`
- Create: `apps/cabinet/components/PackageCard.tsx`
- Create: `apps/cabinet/app/shop/page.tsx`

**Interfaces:**
- Consumes: backend `GET /me/purchases/packages` → `PackageView[]`, backend `POST /me/purchases`
  (`{packageId}` → `{confirmationUrl}` or an error envelope), `serverFetch`, `ApiError`.
- Produces:
  - Route handler `POST /api/checkout` (`{packageId}` → `200 {confirmationUrl}` |
    `4xx/5xx {message}`). Same-origin; reads the session cookie, forwards to the backend.
  - `components/BuyButton.tsx`: `"use client"` — `BuyButton({ packageId, priceLabel })`; on
    click POSTs `/api/checkout`, then `window.location.href = confirmationUrl` (full redirect,
    not fetch-follow); shows a spinner while pending and an inline error string on failure.
  - `components/PackageCard.tsx`: server component rendering one package (amount + crystal
    icon, price) with a `BuyButton` inside.
  - Route `/shop`.

- [ ] **Step 1: Design pass (skills)**

```bash
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "in-app currency store package tiers pricing card" --domain ux
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "primary purchase CTA button states loading" --domain style
```

Three package tiers; the middle one is usually the anchor — note whether the data suggests
highlighting it. Keep it honest (no fake "SALE" badges — spec explicitly excludes a pricing
engine).

- [ ] **Step 2: Create `apps/cabinet/app/api/checkout/route.ts`**

```ts
import { NextResponse } from "next/server";

import { ApiError, serverFetch } from "@/lib/api";

export async function POST(request: Request) {
  let packageId: unknown;
  try {
    ({ packageId } = await request.json());
  } catch {
    return NextResponse.json({ message: "Некорректный запрос" }, { status: 400 });
  }
  if (typeof packageId !== "string" || !packageId) {
    return NextResponse.json({ message: "Не указан пакет" }, { status: 400 });
  }

  try {
    const data = await serverFetch<{ confirmationUrl: string }>("/me/purchases", {
      method: "POST",
      body: JSON.stringify({ packageId }),
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ message: err.message }, { status: err.status || 502 });
    }
    return NextResponse.json({ message: "Не удалось начать оплату" }, { status: 502 });
  }
}
```

- [ ] **Step 3: Create `components/BuyButton.tsx`**

```tsx
"use client";

import { useState } from "react";

export function BuyButton({ packageId, priceLabel }: { packageId: string; priceLabel: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.confirmationUrl) {
        setError(body?.message ?? "Не удалось начать оплату, попробуйте позже");
        setPending(false);
        return;
      }
      window.location.href = body.confirmationUrl;
    } catch {
      setError("Нет связи с сервером, попробуйте позже");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={buy}
        disabled={pending}
        className="rounded-xl bg-accent px-5 py-3 font-semibold text-background disabled:opacity-60"
      >
        {pending ? "Открываем оплату…" : priceLabel}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/PackageCard.tsx` and `app/shop/page.tsx`**

`PackageCard({ pkg }: { pkg: PackageView })` — `bg-surface rounded-[22px] p-6` with
`{pkg.amount} кристаллов` (display font, `text-crystal`) and a `BuyButton packageId={pkg.id}
priceLabel={rubles(pkg.priceRubKopecks)}`.

```tsx
// app/shop/page.tsx
import { AppShell } from "@/components/AppShell";
import { PackageCard } from "@/components/PackageCard";
import { fetchOrExpire } from "@/lib/api";
import type { PackageView } from "@/lib/types";

export default async function ShopPage() {
  const packages = await fetchOrExpire<PackageView[]>("/me/purchases/packages");

  return (
    <AppShell active="shop">
      <p className="mb-4 text-sm text-text-muted">
        Оплата проходит через ЮKassa. После оплаты вернитесь в приложение — баланс обновится
        автоматически.
      </p>
      <div className="grid gap-3">
        {packages.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5: Verify + critique + polish**

typecheck/lint/build. `orca` walkthrough as the demo player: `/shop` lists 3 packages with ₽
prices. Click a buy button — **with no YooKassa keys configured the backend returns 502 «Не
удалось начать оплату, попробуйте позже»**; confirm that message appears inline under the
button and the page doesn't crash. (The success redirect is verified in the follow-up once
sandbox keys exist — see plan footer.) Optionally check the backend created a `Purchase` row
with `status = FAILED`. Run `Skill critique`, apply, `Skill polish`, apply. Record findings.

- [ ] **Step 6: Commit**

```bash
git add apps/cabinet
git commit -m "feat(cabinet): crystal shop + same-origin checkout route handler

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 8: Wallet-return page (`/wallet`) + wallet poll route handler

**Files:**
- Create: `apps/cabinet/app/api/wallet/route.ts`
- Create: `apps/cabinet/app/wallet/page.tsx`

**Interfaces:**
- Consumes: backend `GET /wallet` → `WalletView` (via `serverFetch`), `AppShell`.
- Produces:
  - Route handler `GET /api/wallet` → `200 WalletView` | `401/5xx {message}`. Same-origin,
    reads the session cookie. Used only by the client poll on `/wallet`.
  - Route `/wallet?purchase=<id>` — a `"use client"` page that polls `/api/wallet` every 2s
    (max 30s), stops as soon as `hard` increases vs. the first reading, and shows one of:
    "обрабатываем платёж" (polling), "Готово! Кристаллы зачислены" (balance grew), or
    "Если платёж прошёл, баланс обновится в течение пары минут" (timeout).

- [ ] **Step 1: Create `apps/cabinet/app/api/wallet/route.ts`**

```ts
import { NextResponse } from "next/server";

import { ApiError, serverFetch } from "@/lib/api";
import type { WalletView } from "@/lib/types";

export async function GET() {
  try {
    const wallet = await serverFetch<WalletView>("/wallet");
    return NextResponse.json(wallet);
  } catch (err) {
    const status = err instanceof ApiError ? err.status || 502 : 502;
    return NextResponse.json({ message: "Не удалось получить баланс" }, { status });
  }
}
```

- [ ] **Step 2: Create `apps/cabinet/app/wallet/page.tsx`**

`"use client"`. On mount: fetch `/api/wallet` once for a baseline `hard`, then `setInterval`
every 2000ms re-fetch; clear on `hard > baseline` (→ `status = "done"`) or after 15 polls
(→ `status = "timeout"`). Render inside `AppShell active="home"` a centered status block:

- `polling`: a spinner + «Обрабатываем платёж…» + «Это занимает несколько секунд».
- `done`: «Готово! Кристаллы зачислены.» + current `hard` + a `Link` to `/`.
- `timeout`: «Если платёж прошёл, баланс обновится в течение пары минут. Можно вернуться в
  приложение.» + a `Link` to `/`.

Read `?purchase` via `useSearchParams()` and show it small/muted as a reference id (do not
depend on it for logic — the balance delta is the signal). Wrap the `useSearchParams()` usage
in a `<Suspense>` boundary per Next 16 requirement (check
`node_modules/next/dist/docs/.../use-search-params*` if the build complains).

- [ ] **Step 3: Verify + critique + polish**

typecheck/lint/build. `orca`: open `/wallet?purchase=test-123` as the demo player → shows the
polling state, then after ~30s flips to the timeout copy (no real payment in the loop). Then,
in a shell, `grant`-style bump isn't available; instead confirm the "done" path by editing the
demo player's wallet `hard` directly in `psql` mid-poll and watching the page flip to «Готово».
Run `Skill critique` + `Skill polish`, apply, record.

- [ ] **Step 4: Commit**

```bash
git add apps/cabinet
git commit -m "feat(cabinet): post-payment wallet-return page with balance polling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 9: Mobile entry point (`apps/mobile`)

**Files:**
- Create: `apps/mobile/lib/cabinet.ts`
- Modify: `apps/mobile/.env.example`
- Modify: `apps/mobile/app/(app)/(tabs)/profile.tsx`

**Interfaces:**
- Consumes: `apiRequest` (`apps/mobile/lib/api.ts`), backend `POST /auth/cabinet-link-token`
  → `{code, expiresInSeconds}`, `expo-linking` (already a dependency), env
  `EXPO_PUBLIC_CABINET_URL`.
- Produces: `lib/cabinet.ts` exporting `openCabinet(path?: "/" | "/shop" | "/stats"):
  Promise<void>`; two new controls on the profile screen's wallet card.

- [ ] **Step 1: Add the env var**

Append to `apps/mobile/.env.example`:

```bash

# Base URL of the player cabinet site (apps/cabinet). The app opens
# <this>/auth/callback?code=... in the system browser for wallet/stats/purchases.
# Local dev: http://localhost:3100  (on a physical phone use your computer's LAN IP)
EXPO_PUBLIC_CABINET_URL=http://localhost:3100
```

- [ ] **Step 2: Create `apps/mobile/lib/cabinet.ts`**

```ts
import * as Linking from "expo-linking";

import { apiRequest } from "./api";

const CABINET_URL = (process.env.EXPO_PUBLIC_CABINET_URL ?? "http://localhost:3100").replace(
  /\/$/,
  "",
);

type CabinetPath = "/" | "/shop" | "/stats";

/** Mint a 60-second one-time code and hand the player a cabinet session in the SYSTEM browser
 * (not an in-app WebView — the user must physically leave the app; see the design spec's
 * Apple-risk rationale). Throws if the code request fails; the caller shows the error. */
export async function openCabinet(path: CabinetPath = "/"): Promise<void> {
  const { code } = await apiRequest<{ code: string; expiresInSeconds: number }>(
    "/auth/cabinet-link-token",
    { method: "POST" },
  );
  const url = `${CABINET_URL}/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(path)}`;
  await Linking.openURL(url);
}
```

- [ ] **Step 3: Wire the two controls into `profile.tsx`**

In `apps/mobile/app/(app)/(tabs)/profile.tsx`:

1. Add imports: `Pressable` to the `react-native` import; `import { openCabinet } from
   "../../../lib/cabinet";`.
2. Add state: `const [openingCabinet, setOpeningCabinet] = useState(false);`.
3. Add a handler:

```tsx
  const onOpenCabinet = async (path: "/shop" | "/stats") => {
    setOpeningCabinet(true);
    try {
      await openCabinet(path);
    } catch (err) {
      Alert.alert("Не получилось", err instanceof ApiError ? err.message : "Попробуйте позже");
    } finally {
      setOpeningCabinet(false);
    }
  };
```

4. Inside the wallet `<View style={styles.card}>`, after the `walletRow`/`muted` block, add:

```tsx
          <Button
            title="Пополнить кристаллы"
            onPress={() => onOpenCabinet("/shop")}
            loading={openingCabinet}
          />
          <Pressable onPress={() => onOpenCabinet("/stats")} disabled={openingCabinet}>
            <Text style={styles.cabinetLink}>Личный кабинет и статистика →</Text>
          </Pressable>
```

5. Add to `StyleSheet.create({...})`:

```tsx
  cabinetLink: { color: colors.accent, fontSize: 14, textAlign: "center", paddingVertical: 8 },
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter @arcana/mobile typecheck
pnpm --filter @arcana/mobile lint
```

Expected: both pass.

- [ ] **Step 5: Live check (web target is enough for the handshake)**

With backend (seeded) + `apps/cabinet` dev server both running, and
`apps/mobile/.env` containing `EXPO_PUBLIC_CABINET_URL=http://localhost:3100`:

```bash
cd apps/mobile && npx expo start --web
```

Log in as `player@arcana.app` / `Player123!`, go to the Профиль tab, tap «Пополнить
кристаллы». Expected: a new browser tab opens at `/auth/callback?...&next=/shop`, exchanges
the code, lands on `/shop` logged in as the demo player. Tap «Личный кабинет и статистика →»
→ lands on `/stats`. Use `orca` to drive this if helpful. Record the result.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): open the player cabinet from the profile wallet card

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 10: Integration pass + docs

**Files:**
- Modify: `docs/superpowers/specs/2026-09-06-player-cabinet-design.md` (mark site status done)
- Modify: `apps/api/CLAUDE.md` or root `CLAUDE.md` (add `apps/cabinet` to the repo map — one
  paragraph, matching the existing `apps/admin` mention)
- Verify only: everything else

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a green full-repo check and updated docs. No new runtime code.

- [ ] **Step 1: Full workspace verification**

```bash
cd /Users/pavelgolubinec/Desktop/MyProjects/Startaps/Arcana-
pnpm install
pnpm --filter @arcana/shared build
pnpm --filter @arcana/cabinet typecheck && pnpm --filter @arcana/cabinet lint && pnpm --filter @arcana/cabinet build
pnpm --filter @arcana/mobile typecheck && pnpm --filter @arcana/mobile lint
cd apps/api && source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest
ruff check app seed.py
```

Expected: all green. Fix anything that isn't before proceeding.

- [ ] **Step 2: Full manual walkthrough with `orca`**

Backend (seeded) + cabinet dev server + mobile web. As `player@arcana.app`:
1. Profile → «Пополнить кристаллы» → browser opens → `/shop` logged in.
2. `/` shows balance 500 / 200.
3. `/stats` shows «Маска и Слово» with Данте + Лия bars.
4. `/shop` buy → inline 502 message (no keys) — expected.
5. Re-open the same `callback?code=` → `/session-expired`.
6. Wait for the access token to expire (or delete the `arcana_cab_at` cookie) → reload any
   page → proxy refreshes silently, page still renders.

Record the walkthrough outcome in the task notes.

- [ ] **Step 3: Update the spec status line**

In `docs/superpowers/specs/2026-09-06-player-cabinet-design.md`, under «Статус реализации»,
add a line: the site (`apps/cabinet`) and mobile entry point are implemented as of
2026-09-07; outstanding: YooKassa sandbox keys + live payment/webhook run, production deploy.

- [ ] **Step 4: Update the repo map**

Add `apps/cabinet` next to the `apps/admin` mention in the root `CLAUDE.md` "Что это за
проект" section — one sentence: player-facing cabinet site (wallet, stats, YooKassa crystal
purchases), Next.js, entered only via a one-time code from the mobile app.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-06-player-cabinet-design.md CLAUDE.md
git commit -m "docs: mark player cabinet site + mobile entry point implemented

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

- [ ] **Step 6: Report follow-ups**

These are out of scope for this plan (spec §«Что не в этом плане») — surface them to the user
for Todoist once the MCP server is reconnected:
1. Obtain YooKassa sandbox `shopId` + secret key; set `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY`
   in `apps/api/.env`; run the full pay→webhook→credit loop end to end and verify the
   `/wallet` "done" path fires for real.
2. Push `player-cabinet-backend` + this branch and open the PR(s).
3. Register `cabinet.arcana.app`, deploy `apps/cabinet` (set `API_BASE_URL`,
   `COOKIE_SECURE=true`), set `CABINET_BASE_URL` on the API and `EXPO_PUBLIC_CABINET_URL` in
   `eas.json` for mobile builds.

---

## Self-Review

**Spec coverage:**
- «Точка входа в приложении» → Task 9. ✓
- httpOnly-cookie session, server-side `lib/api.ts`, silent refresh → Task 3 (`proxy.ts` does
  the refresh; `cookies()` can't write from server components, so the proxy is the right
  layer). ✓
- `/auth/callback` → Task 4. ✓
- `/` wallet balance → Task 5. ✓
- `/shop` + full redirect to `confirmation_url` → Task 7. ✓
- `/wallet?purchase=` polling → Task 8. ✓
- `/stats` relationship bars + general → Task 6. ✓
- `/session-expired` → Task 3. ✓
- Localized text via `ru` → `lib/format.ts` `localized()` (Task 5). ✓
- Visual direction = Arcana aesthetic, design skills → Global Constraints + Steps 1/8 of
  Tasks 5–8. ✓
- Demo data for the live walkthroughs → Task 2. ✓
- Deploy + live YooKassa run explicitly deferred → plan footer + Task 10 Step 6. ✓

**Placeholder scan:** No "TBD"/"handle errors appropriately" left — error paths are spelled
out (proxy → `/session-expired`; checkout → inline `err.message`; wallet route → 502 JSON).
Tasks 5/6 component *visuals* are described rather than fully coded because they are the design-
skill's job; their interfaces, data, copy, and files are exact.

**Type consistency:** `WalletView`, `PackageView`, `StoryStatsView` defined once in
`lib/types.ts` (Task 5), used verbatim in Tasks 5–8. `AT_COOKIE`/`RT_COOKIE`/`cookieOptions`/
`jwtExpired` defined in `lib/session.ts` (Task 3), used in `proxy.ts` and
`app/auth/callback/route.ts`. `serverFetch`/`fetchOrExpire`/`ApiError` from `lib/api.ts`
(Task 3). `openCabinet` signature (Task 9) matches its `profile.tsx` call sites.

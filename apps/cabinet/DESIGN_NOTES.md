# Cabinet — design direction

Set in Task 5 (app shell + Home). Tasks 6–8 (stats, shop, shared UI) follow this instead of
re-running `frontend-design`.

## Concept

The cabinet is a **web companion to the Arcana mobile app** — players open it from a one-time
link on their phone to check balance, story stats, and buy crystals. It must read as the same
product: "midnight ballroom" warm near-black, gilt-gold accent, engraved-serif numerals. Not a
generic dark dashboard. Mobile-first, single column, `max-w-md`.

## Skills consulted

- `frontend-design` — set the concept below; the one deliberate risk is the **gilt top edge**
  on cards (a fading gold hairline) + **ledger-column hairlines** between the three balance
  stats. Everything else stays quiet.
- `ui-ux-pro-max` style search → **"Dark Mode (OLED)"** family: deep warm background, one
  vibrant accent (gold), text contrast ≥7:1, minimal glow, reduced-motion respected. We keep
  the warm `#1a1613` rather than true black — matches `apps/mobile/lib/theme.ts`.
- `ui-ux-pro-max` typography search → **"Classic Elegant" — Playfair Display + Inter**
  ("elegant, luxury, sophisticated, editorial; high contrast between elegant heading and clean
  body"). We use Playfair for display (already wired as `--font-display` in `app/layout.tsx`)
  and the **system UI stack** for body — same call `apps/mobile` makes (Playfair hairlines go
  illegible below ~16px, captions stay on the system font). Inter can be added later without
  changing any component.
- `ui-ux-pro-max` ux search → mobile-first (default styles are the phone layout, breakpoints
  only add), predictable back-button (plain `next/link`, no `replace`), sticky nav must not
  overlap content (our header is static, content has its own `py-6`).

## Tokens (from `app/globals.css`, mirrored from mobile theme)

background `#1a1613` · surface `#241f1a` · surface-raised `#2f2820` · border `#4a3f30` ·
text `#f3ece0` · text-muted `#b8a99a` · accent/gold `#d4af6a` · coin/teal `#7fc9c0` ·
crystal = accent · danger `#e08585`.

## Type scale

| role            | family        | size / weight / tracking                    |
|-----------------|---------------|---------------------------------------------|
| wordmark        | Playfair 700  | 20px, tracking `0.35em`, uppercase          |
| card title      | Playfair 700  | 20px                                        |
| balance numeral | Playfair 700  | 34px (the signature — engraved coin faces)  |
| nav item / link | system        | 15px / 500                                  |
| body / hint     | system        | 13px, text-muted                            |
| micro-label     | system        | 11px, uppercase, tracking `0.14em`, muted   |

## Spacing rhythm

4px base. Container `px-4 py-6`. Stack gap between cards/blocks `16px` (`gap-4` / `mt-4`).
Inside cards `p-6`, internal gaps `16–20px`. Nav items `min-h-11` (44px touch target),
`px-3 py-3`.

## Card treatment

`bg-surface rounded-[22px] p-6` (22px = mobile `radius.lg`). **Gilt top edge**: a 1px
`::before` bar, `linear-gradient(90deg, transparent, accent 50%, transparent)` at ~55% opacity
— the one ornament. Three balance stats in a row split by **vertical hairlines** (`divide-x
divide-border`), value on top (Playfair, colored), label under (micro-label). Below: a level
row — «Уровень N» left, `xpIntoLevel / xpForNextLevel` right (muted, tabular), then a 6px
track (`bg-surface-raised` rounded-full) with a gold fill. Fill width guards against
`xpForNextLevel === 0`.

## Nav / shell

Static header (not sticky — page is short). Wordmark row, then a 3-item nav row:
Баланс → `/`, Статистика → `/stats`, Кристаллы → `/shop`. Active item `text-accent` +
a 2px gold underline; inactive `text-text-muted`, hover → `text-text`. Content lives in
`mx-auto max-w-md px-4 py-6`.

## Buttons / links (Home)

Primary: `bg-accent text-background` pill, `rounded-2xl px-5 py-4`, `font-semibold`.
Secondary: `border border-border text-text` pill, same padding. Both ≥44px tall.

## Motion / a11y

No entrance animation. Only `transition-colors` on interactive elements (150ms). Visible
focus ring (`focus-visible:outline-2 outline-accent outline-offset-2`) on every link.
Contrast: text on background 12:1, muted 6.4:1, gold-on-surface 6.8:1 — all pass AA.

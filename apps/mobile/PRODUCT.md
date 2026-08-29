# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Targets iOS and Android equally (confirmed) via one React Native/Expo codebase with a single shared design language - not a per-OS adapted visual system in the usual sense of "adaptive"; recorded this way only because both native platforms matter equally and both native guides should be consulted.

## Users

Readers of interactive romance/fantasy visual novels (the "Клуб Романтики" genre) - players who read branching stories, make narrative choices (some gated by in-app currency/energy), and return regularly for new chapters and a daily reward. Inferred from README/product framing; not separately confirmed with the user.

## Product Purpose

An interactive visual-novel reader positioned as a direct competitor to "Клуб Романтики". Content (stories, chapters, dialogue, choices, branching) lives in a database and is published through a (planned, not yet built) admin panel - new content ships without an app release.

## Positioning

Custom in-house stories/characters/art (not licensed IP), with content authored and republished without shipping a new app build - the mechanism a template visual-novel app copying only the UI could not replicate.

## Operating Context

Players read on a phone, often in short sessions; the reading engine auto-advances through condition/effect story nodes and stops at dialogue or a choice. Currency/energy economy (soft/hard currency, energy that gates chapter unlocks) and a daily-login reward are core recurring-engagement mechanics.

## Capabilities and Constraints

- React Native (Expo, SDK 54) app, one design system shared by iOS and Android.
- Backend: FastAPI/PostgreSQL (`apps/api`), consumed over HTTP; catalog/auth/wallet/reading-engine endpoints exist today, admin/content-authoring endpoints exist but no admin UI yet.
- Content rating: 16+ (confirmed) - imagery may be romantic/suggestive but must stay within a 16+ app-store rating, not explicit/nude. This bounds hero art, character art, and any future story illustrations.
- No native per-OS visual adaptation is planned; component/theme work should stay a single shared implementation.

## Evidence on Hand

One seeded demo story ("Маска и Слово") with placeholder/AI-generated art. No real production story art, no user testimonials or usage data exist yet - future design work must not invent or imply either.

## Product Principles

1. The romantic-fantasy mood (dark gothic-amber "midnight ballroom" in-app, lighter mystic-pastel at first entry) is the brand; visual choices should reinforce it, not default to generic app-UI patterns.
2. Content changes (new stories/chapters) must never require an app release - design for a system that can absorb new art/copy from an admin panel later.
3. Recurring engagement (daily reward, energy economy) is core to the product; these mechanics should read clearly, not get buried under decoration.
4. Stay within a 16+ content rating: romantic and suggestive is in bounds, explicit is not.

## Accessibility & Inclusion

No project-specific accessibility requirement has been established beyond platform defaults; not yet audited for contrast/dynamic type/screen-reader support.

# Timed Background Media (video/GIF backgrounds + animated emotion sprites) — Design

## Context

Today a DIALOGUE node's background is a single static image: `DialogueNodeData.background_image_url`
(`apps/api/app/schemas/content.py:137`). The reading engine (`play_service.py:217-226`) treats it
as **inheriting forward**: if a node doesn't set a background, the player's save slot
(`slot.current_background_url`) keeps whatever was last explicitly set, so scenarists only set it
where it changes, not on every node. Mobile renders it with a plain `<ImageBackground>`
(`apps/mobile/app/read/[slotId].tsx:88-97`). Character emotion/outfit sprites are the same
mechanism at the character level (`Character.sprites`, a flat `{key: imageUrl}` map, rendered via
`<ImageBackground>` in `StagedSprite`, `apps/mobile/app/read/[slotId].tsx:128-139`).

Both of these currently only accept a single static PNG/JPEG/WebP file
(`apps/api/app/services/uploads_service.py:10-11`, `ALLOWED_CONTENT_TYPES` / `MAX_UPLOAD_BYTES`).

This plan adds two related, separately-shippable capabilities:

1. **Timed background sequences** on a DIALOGUE node: an ordered list of background segments
   (image/GIF/video), each shown for a set number of seconds, with a configurable end behavior.
   This covers two real product needs at once — an "ambient" background that lives its own life
   while the player reads normally, and a timer-driven "mini-cutscene" that advances the scene on
   its own once the sequence finishes.
2. **Animated GIF emotion sprites**: a character's emotion/outfit sprite slot (currently always a
   static image) can hold an animated, looping, transparent-background GIF instead — purely for
   subtle idle motion (blinking, light sway), not for sequencing or auto-advance.

Explicitly separate, deferred efforts raised in the same conversation and NOT covered here (each
needs its own future spec): the screen-effects system (fade/jumpscare/shake transitions); body +
head layered compositing for character art; background audio tracks.

## Scope

- Timed background sequences: backend schema + engine passthrough, admin authoring UI, mobile
  playback.
- Upload pipeline: accept GIF and silent MP4 for backgrounds; accept GIF for character sprites.
- Non-goals (explicitly out of scope for this plan):
  - No server-side time-tracking of any kind. The backend never knows "how many seconds have
    elapsed" — it only ever describes a timeline; all real-time playback and the resulting
    auto-advance call are owned entirely by the mobile client.
  - No audio in background video (silent loops only — confirmed with the product owner;
    avoids iOS/Android autoplay-with-sound restrictions and simplifies playback to a single
    muted/looping `<Video>` component).
  - No video for character emotion sprites (would require alpha-channel video, which has poor,
    inconsistent cross-platform support; GIF already gives transparency with far less engineering
    risk — see "Alternatives considered").
  - No cross-node inheritance for `background_sequence` (see "Data model" below) — a timeline is
    scoped strictly to the one node that sets it.
  - No change to `condition_engine.py`, no new `SceneNodeType`, no change to how CHOICE/CONDITION/
    EFFECT/END nodes work.
  - No admin-side preview/scrubber for testing timeline timing before publishing (watch it live in
    the mobile preview instead, same as every other content change today).
  - No body/head compositing, no background audio (separate future plans).

## Data model

Add one new optional field to `DialogueNodeData` (`apps/api/app/schemas/content.py`), alongside
the existing `background_image_url` — which is left completely untouched for backward
compatibility:

```python
class BackgroundSegment(CamelModel):
    media_url: str
    media_type: Literal["image", "gif", "video"]
    duration_seconds: float  # > 0

class BackgroundSequence(CamelModel):
    segments: list[BackgroundSegment]  # non-empty when background_sequence is set at all
    on_complete: Literal["loop", "hold", "auto_advance"]

class DialogueNodeData(CamelModel):
    ...
    background_image_url: str | None = None       # unchanged
    background_sequence: BackgroundSequence | None = None   # new
    ...
```

**Precedence and inheritance, exactly as decided:**
- If `background_sequence` is set on a node, it drives playback for that node — full stop. It is
  **never inherited** by a later node: the next DIALOGUE node that doesn't set its own
  `background_sequence` does NOT keep running the previous node's timeline. This is a deliberate
  departure from `background_image_url`'s inheritance behavior, chosen specifically to rule out an
  entire class of footgun (an `on_complete: "auto_advance"` sequence inheriting forward and
  silently chaining into an unstoppable auto-advancing sequence of scenes with no way for the
  player to interact — the same category of risk the engine's own
  `MAX_AUTO_TRAVERSAL_STEPS` guards against for CONDITION/EFFECT auto-traversal). A scenarist who
  wants the same timeline to span several consecutive dialogue lines sets it explicitly on each of
  those nodes (duplication is an accepted, explicit cost for safety and simplicity — not a bug).
- If `background_sequence` is absent, behavior is **completely unchanged**: the existing
  `background_image_url` inheritance-via-save-slot logic in `play_service.py:217-226` applies
  exactly as it does today. Existing content needs zero migration.
- A node should not set both `background_image_url` and `background_sequence`. The admin UI (see
  below) enforces this as an either/or toggle, so the API never needs to decide a precedence rule
  between them. If it somehow finds both set (e.g. a sequence replaced manually via direct API
  write), `background_sequence` wins — `background_image_url` on such a node is treated as a
  leftover to be ignored, not an error, matching the codebase's "quiet degradation" convention.

**Engine change**: `play_service.py`'s DIALOGUE view resolution must also serialize
`backgroundSequence` into the view JSON whenever the node has one set (the existing
`backgroundImageUrl` resolution — inheritance via `slot.current_background_url` — is skipped
entirely for a node with `background_sequence`; the save slot's `current_background_url` is left
untouched by that node, so a LATER node with no background of its own correctly falls back to
whatever static background was last active before the sequence, not to anything from inside the
sequence). No other engine logic changes: `condition_engine.py`, `MAX_AUTO_TRAVERSAL_STEPS`, and
CHOICE/CONDITION/EFFECT/END resolution are all untouched.

**Character sprite (GIF emotion)**: no schema change at all. `Character.sprites` is already
`{key: url}` — a GIF URL is just a different kind of value at an existing key. The only change is
in the upload allow-list (below) and a mobile rendering verification (also below).

## Upload pipeline changes

`apps/api/app/services/uploads_service.py`:

- Extend `ALLOWED_CONTENT_TYPES` to add `image/gif` and `video/mp4` (not WebM — materially worse
  iOS compatibility for no real benefit here).
- Raise `MAX_UPLOAD_BYTES` for non-image types: keep images (PNG/JPEG/WebP) at the current 10 MB;
  allow GIF and MP4 up to 20 MB (backgrounds are full-screen and GIF/video compress worse than a
  photo at the same visual size). Character-sprite GIFs specifically are expected to stay well
  under this (recommended ≤5 MB per the authoring guidance below) — enforced by guidance, not by a
  separate hard limit in this pass (YAGNI: one shared ceiling for every non-image upload is
  simpler than tracking "is this upload a background or a sprite" in the generic uploads endpoint,
  and 20 MB already prevents anything pathological).
- No change to storage mechanism, URL shape, or the existing focal-point query-string encoding.

## Admin UI

**Node editor (`apps/admin/components/NodeEditorPanel.tsx`)**: the existing single `ImageUpload`
field for "Фон" becomes a two-way toggle:

- **«Статичный фон»** (default, pre-selected whenever `background_sequence` is absent) — exactly
  today's single-image uploader, unchanged in every respect including its "наследуется от
  предыдущей реплики" helper text.
- **«Таймлайн»** — an ordered list editor: each row uploads one file (image/GIF/MP4, using the
  same `ImageUpload` component, whose underlying `accept` attribute and the backend's own
  content-type check both now allow the new types) and sets a duration in seconds; rows can be
  added, removed, and reordered (simple up/down controls, consistent with this admin's existing
  list-editing patterns — no drag-and-drop needed for an MVP). Below the list, one select for
  "когда список кончится": Зациклить (`loop`) / Остановиться на последнем кадре (`hold`) /
  Перейти дальше автоматически (`auto_advance`). Switching the toggle to «Таймлайн» clears
  `backgroundImageUrl`; switching back to «Статичный фон» clears `backgroundSequence` — the two
  are mutually exclusive in the UI, matching the data model's either/or rule above.

**Character sprite upload (`apps/admin/components/WardrobeMatrix.tsx`)**: no new UI at all. The
existing per-cell `ImageUpload` already accepts "an image file"; once the backend allow-list
includes `image/gif`, a scenarist can simply pick a `.gif` file for any emotion cell exactly as
they pick a `.png` today. The only admin-visible change is that the file picker's `accept`
attribute needs to include `image/gif` alongside the existing image types.

## Mobile playback

**Background sequence** (new `BackgroundStage` component replacing the current plain
`<ImageBackground>` consumer in `apps/mobile/app/read/[slotId].tsx` for the sequence case):

- Given a `backgroundSequence` on the current view, runs a local segment timer
  (`setTimeout`-chained, not `setInterval`, to avoid drift accumulation across segments): shows
  segment 0 for `durationSeconds`, then segment 1, etc.
- Renders an image/GIF segment with the same `<ImageBackground>` used today (GIF animates
  automatically — RN's `Image`/`ImageBackground` plays animated GIF natively, confirmed by this
  app's own React Native + Expo setup with no extra library; verify this explicitly on a real
  Android build during implementation, not just iOS, since GIF support has historically needed
  Fresco's animated-GIF module enabled — Expo's managed workflow is expected to already include
  it, but "expected" isn't "verified").
- Renders a video segment with a muted, looping-disabled `<Video>` (from `expo-av` or `expo-video`
  — confirm which this app already depends on, or add the lighter one; no audio track is ever
  expected per this background's own content constraint, but the player is still explicitly muted
  as defense-in-depth against a mis-exported file).
- On reaching the end of the list: `loop` restarts the local timer at segment 0; `hold` stops
  timing and keeps rendering the last segment indefinitely; `auto_advance` calls the exact same
  "advance to next node" function the screen's own tap handler calls — no new API endpoint, no new
  engine concept, just an automated call to the same function a manual tap already triggers.
- The timer is cleared whenever the player navigates away from this node (new view loaded, or the
  screen unmounts) — a background sequence never keeps running or firing `auto_advance` calls
  after the node that owns it is no longer the one being shown.
- App-backgrounding: pause the timer while the app is backgrounded (React Native's `AppState`) and
  resume on foreground, rather than letting it silently accumulate a large backlog and fire
  multiple auto-advances at once when the player returns. This is the one real correctness risk
  worth calling out explicitly: an un-paused timer that queues up, say, three elapsed
  `auto_advance` segments while the phone was locked would otherwise skip the player through three
  scenes they never saw.

**Character sprite GIF**: no new component. `StagedSprite` already renders whatever URL it's
given via `<ImageBackground>`; a GIF URL animates with zero code change once it can be uploaded.

## Error handling

- A `background_sequence` with an empty `segments` list is rejected at the API layer (400) — same
  posture as other "must be non-empty when present" fields elsewhere in this schema family.
- `duration_seconds <= 0` is rejected at the API layer (400).
- A segment whose `media_url` fails to load on the client (404, network error, corrupt file):
  render a solid-color fallback (reuse the existing background scrim color,
  `apps/mobile/app/read/[slotId].tsx:231`, `"#0a0812"`) for that segment's duration and continue
  the timeline rather than crashing or freezing — matches this codebase's established
  "тихая деградация, не 500 / не краш" convention, applied here on the client since the failure is
  a client-side network/asset issue, not a server error.
- `auto_advance` on a node whose `next_node_id` is `None` (dead end): do nothing further once the
  timeline completes — exactly how a tap-to-advance already behaves on a node with no
  `next_node_id` today (`canAdvance: false`); no special-casing needed since it reuses the same
  advance function.

## Testing plan

- **Backend** (`apps/api/tests`): new `BackgroundSequence`/`BackgroundSegment` schema validation
  (empty segments rejected, non-positive duration rejected); `play_service` test confirming a node
  with `background_sequence` set does NOT update `slot.current_background_url`, and that a
  following node with neither field set still resolves to whatever static background was active
  *before* the sequence node (proving non-inheritance is real, not just "untested but probably
  fine"); uploads-service test confirming GIF/MP4 are now accepted and oversized files in the new
  20 MB band are still rejected correctly.
- **Admin** (no test runner in this repo, per existing convention): `pnpm --filter @arcana/admin
  typecheck && lint && build`, plus a live walkthrough building one static-background node and one
  timeline node (both GIF and video segments, all three `on_complete` values) and confirming the
  saved data round-trips correctly through a reload.
- **Mobile**: live walkthrough on both iOS and Android (GIF animation support is the one genuine
  platform-divergence risk called out above) confirming: a GIF emotion sprite animates; a
  background timeline advances through its segments on schedule; all three `on_complete` behaviors
  behave as specified; backgrounding the app mid-timeline and returning does not fire a backlog of
  skipped `auto_advance` calls.

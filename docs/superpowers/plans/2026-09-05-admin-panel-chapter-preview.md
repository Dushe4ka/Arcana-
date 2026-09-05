# Chapter Preview (Admin Panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a scriptwriter click through a chapter in the admin panel exactly as a player would see it (background, character sprites, dialogue box, choices), starting from any node, without touching real save slots or the wallet.

**Architecture:** The backend side-effect-free preview engine already exists (`POST /admin/preview/chapters/{id}` and `.../choose`, see `apps/api/app/services/preview_service.py` — merged in the admin-panel-backend-foundation plan). This plan is frontend-only: a new `PreviewPlayer` component that ports the visual rendering from `apps/mobile/app/read/[slotId].tsx` to the web (a fixed-aspect "phone frame" so sprite left/center/right positioning looks the same as the real app), a dedicated route that hosts it, and entry-point buttons wired into the existing scene editor (list view + graph view) so a scriptwriter can jump straight into previewing any specific node, not just the chapter's start.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 — same stack as the rest of `apps/admin`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-panel-design.md` (preview mentioned at the "side-effect-free preview" level; this plan supplies the UI design the spec left unspecified, approved in chat with the user before this plan was written: full visual fidelity, dedicated route, launchable from any node).

## Global Constraints

- Backend contract (do not change): `POST /admin/preview/chapters/{chapterId}` body `{nodeId: string|null, backgroundUrl: string|null, values: Record<string, VariableScalar>}` → `PreviewStepOut`; `POST /admin/preview/chapters/{chapterId}/choose` body `{nodeId: string, choiceOptionId: string, backgroundUrl: string|null, values: Record<string, VariableScalar>}` → `PreviewStepOut`. `nodeId: null` (or omitted) makes the backend default to the chapter's `entryNodeId`; if neither exists it 400s with a real Russian message ("У главы не задана начальная сцена") — display that message as-is, don't special-case it.
- The preview flow is entirely client-driven state: `values` and `backgroundUrl` are NOT stored server-side. Every request must echo back the previous response's `values`/`backgroundUrl`, and the client keeps a local history stack for "Назад"/"Начать заново" — there is no backend "go back" support and none should be added.
- Never call any endpoint other than the two preview endpoints and the two read-only fetches (`/admin/chapters/{id}`, `/admin/characters?storyId=`) from this feature. No save-slot, wallet, or mutation endpoint may be touched — the whole point of preview is zero side effects.
- Every mutation/network handler needs its own try/catch surfacing `ApiError.message` (or a Russian fallback) into visible UI state — this precedent was violated at least once in each of the three prior admin-panel plans this session, always caught in review. Don't repeat it.
- The `react-hooks/set-state-in-effect` ESLint rule fires on any `setState` reachable from an effect-invoked function, including React's own fetch-on-mount pattern. Suppress with `// eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; rule flags React's own canonical pattern regardless of await timing` placed **directly above the literal function-call statement it suppresses** (e.g. directly above `load();` or `start();`) — never above an explanatory comment or a different line. A previous task in this session shipped this exact bug (the directive suppressed a comment, not the call) and it was only caught in review.
- Images from uploaded/arbitrary URLs are rendered with a plain `<img>` tag plus `// eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded-file URLs, not a static local asset next/image can optimize` directly above each `<img>` — this is the existing convention (see `apps/admin/components/ImageUpload.tsx:50-51`). Do not use `next/image`.
- Text fields are localized (`{ru: string, en?: string}`); admin code always reads `.ru` directly with no i18n helper (unlike the mobile app, which has one). Follow that — don't introduce a `t()` helper here.
- A live-browser CLI, `orca`, is installed on this machine and reachable via Bash from any shell (no special tool needed — it's a plain binary at `/usr/local/bin/orca`). Use it to actually verify interactive behavior instead of falling back to "no browser available, verified via code trace" — that caveat was necessary in earlier tasks this session and no longer needs to be. Key commands: `orca tab create --url <url> --json`, `orca snapshot --json` (returns an accessibility-tree snapshot with `ref` ids for every interactive element), `orca click --element <ref> --json`, `orca fill --element <ref> --value <text> --json`, `orca select --element <ref> --value <text> --json`, `orca eval --expression <js> --json` (e.g. `location.reload()`), `orca tab close --json`. Run `orca agent-context --json` for the full command reference if you need something beyond these. The admin dev server is normally already running at `http://localhost:3000` and the backend at `http://localhost:4000` in this environment — check with `lsof -nP -iTCP:3000 -sTCP:LISTEN` / `:4000` before assuming you need to start them; if neither is running, start the backend with `cd apps/api && source .venv/bin/activate && uvicorn app.main:asgi_app --port 4000` and the admin panel with `cd apps/admin && npx next dev --port 3000`, both in the background. Login: `admin@arcana.app` / `ChangeMe123!`.

---

### Task 1: PreviewPlayer component + preview route

**Files:**
- Modify: `apps/admin/lib/types.ts` (append preview view types)
- Create: `apps/admin/components/PreviewPlayer.tsx`
- Create: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/preview/page.tsx`

**Interfaces:**
- Consumes: `apiRequest`/`ApiError` from `@/lib/api`, `ChapterOut`/`CharacterOut` from `@/lib/types` (both already exist), the two preview endpoints described in Global Constraints.
- Produces: `PreviewPlayer({ chapterId, startNodeId, characters }: { chapterId: string; startNodeId: string | null; characters: CharacterOut[] })` — a self-contained component (owns its own fetch/state, like `SceneGraphView` and `NodeEditorPanel` already do). Produces the route `/stories/[id]/chapters/[chapterId]/preview?nodeId=<optional>` that Task 2 links to.

- [ ] **Step 1: Add preview view types to `apps/admin/lib/types.ts`**

Append at the end of the file (it already imports `LocalizedText` at the top — no new import needed):

```typescript
export type CharacterTag = {
  id: string;
  name: LocalizedText;
  nameColor: string;
};

export type StagedCharacterView = {
  characterId: string;
  name: LocalizedText;
  nameColor: string;
  spriteUrl: string | null;
  position: "left" | "center" | "right";
};

export type PreviewDialogueView = {
  type: "DIALOGUE";
  nodeId: string;
  speaker: CharacterTag | null;
  text: LocalizedText;
  isThought: boolean;
  backgroundImageUrl: string | null;
  staged: StagedCharacterView[];
  canAdvance: boolean;
  nextNodeId: string | null;
};

export type PreviewChoiceOptionView = {
  id: string;
  text: LocalizedText;
  costCurrency: "SOFT" | "HARD" | null;
  costAmount: number;
  affordable: boolean;
};

export type PreviewChoiceView = {
  type: "CHOICE";
  nodeId: string;
  prompt: LocalizedText | null;
  options: PreviewChoiceOptionView[];
};

export type PreviewEndView = {
  type: "END";
  nodeId: string;
};

export type PreviewNodeView = PreviewDialogueView | PreviewChoiceView | PreviewEndView;

export type PreviewStepOut = {
  view: PreviewNodeView;
  backgroundUrl: string | null;
  values: Record<string, number | boolean | string>;
};
```

- [ ] **Step 2: Create `apps/admin/components/PreviewPlayer.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type {
  CharacterOut,
  PreviewChoiceView,
  PreviewDialogueView,
  PreviewNodeView,
  PreviewStepOut,
  StagedCharacterView,
} from "@/lib/types";

type Snapshot = {
  view: PreviewNodeView;
  backgroundUrl: string | null;
  values: Record<string, number | boolean | string>;
};

export function PreviewPlayer({
  chapterId,
  startNodeId,
  characters,
}: {
  chapterId: string;
  startNodeId: string | null;
  characters: CharacterOut[];
}) {
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

  const current = history.length > 0 ? history[history.length - 1] : null;

  const charactersById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);

  const start = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<PreviewStepOut>(`/admin/preview/chapters/${chapterId}`, {
        method: "POST",
        body: JSON.stringify({ nodeId: startNodeId, backgroundUrl: null, values: {} }),
      });
      setHistory([{ view: data.view, backgroundUrl: data.backgroundUrl, values: data.values }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить превью");
    } finally {
      setBusy(false);
    }
  }, [chapterId, startNodeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; rule flags React's own canonical pattern regardless of await timing
    start();
  }, [start]);

  const advance = async () => {
    if (!current || current.view.type !== "DIALOGUE" || !current.view.canAdvance || busy) return;
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<PreviewStepOut>(`/admin/preview/chapters/${chapterId}`, {
        method: "POST",
        body: JSON.stringify({
          nodeId: current.view.nextNodeId,
          backgroundUrl: current.backgroundUrl,
          values: current.values,
        }),
      });
      setHistory((h) => [...h, { view: data.view, backgroundUrl: data.backgroundUrl, values: data.values }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось перейти дальше");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (choiceOptionId: string) => {
    if (!current || current.view.type !== "CHOICE" || busy) return;
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<PreviewStepOut>(`/admin/preview/chapters/${chapterId}/choose`, {
        method: "POST",
        body: JSON.stringify({
          nodeId: current.view.nodeId,
          choiceOptionId,
          backgroundUrl: current.backgroundUrl,
          values: current.values,
        }),
      });
      setHistory((h) => [...h, { view: data.view, backgroundUrl: data.backgroundUrl, values: data.values }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось выполнить выбор");
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setError(null);
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  };

  const restart = () => {
    setError(null);
    start();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          onClick={goBack}
          disabled={history.length <= 1 || busy}
          className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-40"
        >
          ← Назад
        </button>
        <button onClick={restart} disabled={busy} className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-40">
          Начать заново
        </button>
        <button
          onClick={() => setShowVariables((v) => !v)}
          className="rounded border border-neutral-300 px-3 py-1"
        >
          {showVariables ? "Скрыть переменные" : "Переменные"}
        </button>
      </div>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {showVariables && current && (
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
          {Object.keys(current.values).length === 0 && (
            <p className="text-xs text-neutral-500">Переменных пока нет</p>
          )}
          {Object.entries(current.values).map(([key, value]) => {
            const [variableKey, characterId] = key.split("::");
            const character = characterId ? charactersById.get(characterId) : undefined;
            return (
              <div key={key} className="flex justify-between gap-2 text-xs">
                <span className="text-neutral-600">
                  {variableKey}
                  {character ? ` · ${character.name.ru}` : ""}
                </span>
                <span className="font-mono">{String(value)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mx-auto w-full max-w-[420px]">
        <div
          className="relative overflow-hidden rounded-lg border border-neutral-300 bg-black"
          style={{ aspectRatio: "9 / 19.5" }}
        >
          {current && current.backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded-file URLs, not a static local asset next/image can optimize
            <img src={current.backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/25" />

          {current?.view.type === "DIALOGUE" && (
            <div className="absolute inset-x-0 bottom-[18%] h-[60%]">
              {current.view.staged.map((s) => (
                <StagedSprite key={s.characterId} staged={s} />
              ))}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 p-3">
            {!current && !error && <p className="text-center text-sm text-neutral-300">Загрузка…</p>}
            {current?.view.type === "DIALOGUE" && (
              <DialogueBox view={current.view} onAdvance={advance} busy={busy} />
            )}
            {current?.view.type === "CHOICE" && (
              <ChoicePanel view={current.view} onChoose={choose} busy={busy} />
            )}
            {current?.view.type === "END" && <EndPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}

function StagedSprite({ staged }: { staged: StagedCharacterView }) {
  if (!staged.spriteUrl) return null;
  const posClass =
    staged.position === "left"
      ? "left-0"
      : staged.position === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded-file URLs, not a static local asset next/image can optimize
    <img src={staged.spriteUrl} alt="" className={`absolute bottom-0 h-full w-[34%] object-contain ${posClass}`} />
  );
}

function DialogueBox({
  view,
  onAdvance,
  busy,
}: {
  view: PreviewDialogueView;
  onAdvance: () => void;
  busy: boolean;
}) {
  return (
    <button
      onClick={onAdvance}
      disabled={!view.canAdvance || busy}
      className={`w-full rounded-lg border p-4 text-left ${
        view.isThought ? "border-dashed border-neutral-400" : "border-neutral-300"
      } bg-black/80 disabled:cursor-default`}
    >
      {view.speaker && (
        <p className="mb-1 text-sm font-bold" style={{ color: view.speaker.nameColor }}>
          {view.speaker.name.ru}
        </p>
      )}
      <p className={`text-sm leading-relaxed text-white ${view.isThought ? "italic text-neutral-300" : ""}`}>
        {view.text.ru}
      </p>
      {view.canAdvance && (
        <p className="mt-1 text-right text-xs text-neutral-400">▼ нажмите, чтобы продолжить</p>
      )}
    </button>
  );
}

function ChoicePanel({
  view,
  onChoose,
  busy,
}: {
  view: PreviewChoiceView;
  onChoose: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {view.prompt && <p className="text-center text-sm font-semibold text-white">{view.prompt.ru}</p>}
      {view.options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChoose(option.id)}
          disabled={busy}
          className="flex items-center justify-between rounded-lg border border-white/60 bg-black/70 px-4 py-3 text-left text-sm text-white disabled:opacity-50"
        >
          <span>{option.text.ru}</span>
          {option.costCurrency && (
            <span className="text-xs font-semibold text-amber-300">
              {option.costCurrency === "HARD" ? "💎" : "🪙"} {option.costAmount}
            </span>
          )}
        </button>
      ))}
      {view.options.length === 0 && (
        <p className="text-center text-xs text-neutral-300">
          Нет доступных вариантов при текущих значениях переменных
        </p>
      )}
    </div>
  );
}

function EndPanel() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-black/80 p-6">
      <p className="text-lg font-bold text-white">Конец главы (превью)</p>
    </div>
  );
}
```

Note: `EndPanel` has no restart button of its own — the toolbar's "Начать заново" button (always visible above the frame) already covers that; a second one would be redundant.

- [ ] **Step 3: Create the preview page route**

`apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/preview/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { apiRequest, ApiError } from "@/lib/api";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import type { ChapterOut, CharacterOut } from "@/lib/types";

export default function ChapterPreviewPage() {
  const { id: storyId, chapterId } = useParams<{ id: string; chapterId: string }>();
  const searchParams = useSearchParams();
  const startNodeId = searchParams.get("nodeId");

  const [chapter, setChapter] = useState<ChapterOut | null>(null);
  const [characters, setCharacters] = useState<CharacterOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [chapterData, charactersData] = await Promise.all([
          apiRequest<ChapterOut>(`/admin/chapters/${chapterId}`),
          apiRequest<CharacterOut[]>(`/admin/characters?storyId=${storyId}`),
        ]);
        setChapter(chapterData);
        setCharacters(charactersData);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Не удалось загрузить главу");
      }
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; rule flags React's own canonical pattern regardless of await timing
    load();
    // Note: unlike the chapter editor page's own effect, `load` is declared INSIDE this
    // effect body (not in outer component scope), so `[chapterId, storyId]` is already a
    // fully exhaustive dependency array - no `eslint-disable ... exhaustive-deps` needed or
    // wanted here (an unnecessary disable directive is itself a quality nit).
  }, [chapterId, storyId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!chapter) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Превью: Глава {chapter.index} — {chapter.title.ru}
        </h1>
        <Link
          href={`/stories/${storyId}/chapters/${chapterId}`}
          className="text-sm text-neutral-600 underline"
        >
          К редактору главы
        </Link>
      </div>
      <PreviewPlayer chapterId={chapterId} startNodeId={startNodeId} characters={characters} />
    </div>
  );
}
```

- [ ] **Step 4: Verify statically**

```bash
cd apps/admin
pnpm typecheck
pnpm lint
```

Expected: both clean, no errors or warnings.

- [ ] **Step 5: Verify live with `orca`**

Backend and admin dev server should already be running (see Global Constraints for how to start them if not). Steps:

1. `orca tab create --url "http://localhost:3000" --json` — log in if not already (`admin@arcana.app` / `ChangeMe123!`).
2. Navigate (via `orca eval --expression "location.href='http://localhost:3000/stories/<a real story id from the seed data>'"` or by clicking through the UI) into a story that has a chapter with content — "Тестовая стори" from the seed data has two draft chapters; open its scene editor (`.../chapters/<chapterId>`), create at minimum: one DIALOGUE node with text and a `nextNodeId` pointing at a second DIALOGUE node, and set the first as the chapter's entry scene (matches the exact walkthrough already done manually in this session's final-review verification — reuse that pattern).
3. `orca eval` to navigate directly to `http://localhost:3000/stories/<id>/chapters/<chapterId>/preview` (Task 1 ships no buttons yet — that's Task 2 — so reach the route by typing the URL).
4. `orca snapshot --json` — confirm the dialogue text and speaker render, and a "▼ нажмите, чтобы продолжить" hint is present.
5. Click the dialogue box (`orca click --element <ref of the button>`) — confirm the view advances to the second node's text.
6. Click "Начать заново" — confirm it goes back to the first node's text.
7. Click "← Назад" after advancing once — confirm it returns to the first node WITHOUT a network round trip breaking anything (just re-render from history).
8. Toggle "Переменные" — confirm the panel opens (even if empty, it should say "Переменных пока нет" rather than crash).
9. Clean up any test nodes you created for this check, same as the final-review verification did earlier this session, so the seed data stays clean for the next task.
10. `orca tab close --json`.

Report the exact snapshot text you saw at each step in your report file — "I clicked and it seemed to work" is not sufficient, paste the actual snapshot JSON/text excerpts.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/lib/types.ts apps/admin/components/PreviewPlayer.tsx "apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/preview/page.tsx"
git commit -m "feat(admin): chapter preview player and route"
```

---

### Task 2: Entry-point buttons (list view, graph view, chapter header)

**Files:**
- Modify: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx`
- Modify: `apps/admin/components/SceneGraphView.tsx`

**Interfaces:**
- Consumes: the route from Task 1, `/stories/[id]/chapters/[chapterId]/preview` and `?nodeId=` query param.
- Produces: nothing new consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Add preview links to the chapter editor page**

In `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx`, add the `Link` import at the top:

```tsx
import Link from "next/link";
```

Replace the header block (currently):

```tsx
      <div>
        <h1 className="text-xl font-semibold">
          Глава {chapter.index}: {chapter.title.ru}
        </h1>
        <p className="text-sm text-neutral-500">
          {chapter.status}
          {!chapter.entryNodeId && " · начальная сцена не задана"}
        </p>
      </div>
```

with:

```tsx
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Глава {chapter.index}: {chapter.title.ru}
          </h1>
          <p className="text-sm text-neutral-500">
            {chapter.status}
            {!chapter.entryNodeId && " · начальная сцена не задана"}
          </p>
        </div>
        {chapter.entryNodeId ? (
          <Link
            href={`/stories/${storyId}/chapters/${chapterId}/preview`}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          >
            ▶ Превью
          </Link>
        ) : (
          <span
            title="Сначала задайте начальную сцену"
            className="cursor-not-allowed rounded border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400"
          >
            ▶ Превью
          </span>
        )}
      </div>
```

Then, in the list view's per-node action row (currently):

```tsx
                  <div className="flex gap-3 text-xs">
                    {chapter.entryNodeId !== node.id && (
                      <button onClick={() => onSetEntryNode(node.id)} className="text-neutral-600 underline">
                        Сделать начальной
                      </button>
                    )}
                    <button onClick={() => onDeleteNode(node.id)} className="text-red-600 underline">
                      Удалить
                    </button>
                  </div>
```

add a preview link before the "Сделать начальной" button:

```tsx
                  <div className="flex gap-3 text-xs">
                    <Link
                      href={`/stories/${storyId}/chapters/${chapterId}/preview?nodeId=${node.id}`}
                      className="text-neutral-600 underline"
                    >
                      Превью отсюда
                    </Link>
                    {chapter.entryNodeId !== node.id && (
                      <button onClick={() => onSetEntryNode(node.id)} className="text-neutral-600 underline">
                        Сделать начальной
                      </button>
                    )}
                    <button onClick={() => onDeleteNode(node.id)} className="text-red-600 underline">
                      Удалить
                    </button>
                  </div>
```

- [ ] **Step 2: Add a preview link to the graph view's node sidebar**

In `apps/admin/components/SceneGraphView.tsx`, add these imports at the top (alongside the existing ones):

```tsx
import Link from "next/link";
import { useParams } from "next/navigation";
```

Inside the `SceneGraphView` function body, add right after the `selectedNodeId` state declaration:

```tsx
  const { id: storyId, chapterId } = useParams<{ id: string; chapterId: string }>();
```

Then change the sidebar header (currently):

```tsx
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{NODE_TYPE_LABELS[selectedNode.type]}</span>
            <button onClick={() => setSelectedNodeId(null)} className="text-xs text-neutral-500 underline">
              Закрыть
            </button>
          </div>
```

to:

```tsx
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{NODE_TYPE_LABELS[selectedNode.type]}</span>
            <div className="flex items-center gap-3">
              <Link
                href={`/stories/${storyId}/chapters/${chapterId}/preview?nodeId=${selectedNode.id}`}
                className="text-xs text-neutral-600 underline"
              >
                ▶ Превью отсюда
              </Link>
              <button onClick={() => setSelectedNodeId(null)} className="text-xs text-neutral-500 underline">
                Закрыть
              </button>
            </div>
          </div>
```

- [ ] **Step 3: Verify statically**

```bash
cd apps/admin
pnpm typecheck
pnpm lint
```

Expected: both clean.

- [ ] **Step 4: Verify live with `orca`**

1. Open the chapter editor page for a chapter with an entry node set (reuse Task 1's test setup, or redo it if it was cleaned up).
2. Confirm the "▶ Превью" button in the header is a real (non-disabled-looking) link and navigates to the preview route on click.
3. On a chapter with no entry node set yet, confirm the button renders as the grayed-out disabled-looking span instead (create a fresh empty chapter or temporarily note down and clear `entryNodeId` to check this state — restore it afterward).
4. In list view, click a node's "Превью отсюда" link — confirm the URL has `?nodeId=<that node's id>` and the preview immediately shows that node's content (not the chapter's entry node).
5. Switch to graph view, click a node to open its sidebar, click "▶ Превью отсюда" — confirm it links to the same node's preview.
6. Clean up any nodes/state changes made only for this verification.

Report the exact URLs and snapshot excerpts you observed.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx" apps/admin/components/SceneGraphView.tsx
git commit -m "feat(admin): preview entry points from chapter header, list, and graph views"
```

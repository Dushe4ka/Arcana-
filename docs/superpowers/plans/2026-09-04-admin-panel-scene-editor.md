# Admin Panel Scene Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a scriptwriter actually write a chapter's content in `apps/admin` - create/edit
scene nodes (dialogue, choice, condition, effect, end) and choice options, in both a linear
list view and a React Flow graph view over the same data (per the spec's explicit
requirement that both views ship together, not list-then-graph), and mark which node a
chapter starts from so it becomes publishable.

**Architecture:** New route `app/(app)/stories/[id]/chapters/[chapterId]/page.tsx` inside the
existing role-gated `(app)` route group. Client-side only, same pattern as every other admin
page (fetch on mount, mutate via `apiRequest`, no server components doing data fetching). A
single `NodeEditorPanel` component is shared between the list view (rendered inline under the
clicked row) and the graph view (rendered in a fixed sidebar) - one editing UI, two ways to
navigate to it.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4,
`@arcana/shared` (Zod schemas - `sceneNodeCreateSchema`, `sceneNodeUpdateSchema`,
`choiceOptionCreateSchema`/`choiceOptionUpdateSchema`, already complete and used verbatim),
`@xyflow/react` (React Flow, new dependency for this plan - the graph view).

**Spec:** `docs/superpowers/specs/2026-08-31-admin-panel-design.md`

## Global Constraints

- TypeScript `strict: true`.
- No design work needed for this plan (standing user instruction, same as the prior two admin
  panel plans) - plain Tailwind utility classes, no custom visual design.
- Reuse `@arcana/shared`'s existing Zod schemas instead of redeclaring shapes - they already
  cover every node type's `data` payload, choice options, and the discriminated
  `sceneNodeCreateSchema` union.
- No automated test runner exists for TypeScript packages in this repo (confirmed
  project-wide convention across two prior plans) - verification is `pnpm --filter
  @arcana/admin typecheck` + `lint` + `build`, plus manual browser checks per task.
- Known lint precedent (confirmed correct via empirical testing in an earlier plan's review,
  do not re-litigate): any `load()`-in-`useEffect` fetch-on-mount pattern needs
  `// eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; rule flags
  React's own canonical pattern regardless of await timing` directly above the call.
- Known error-handling precedent (two prior plans each needed a fix round for this - apply it
  from the start): every mutation handler (`apiRequest` call whose result isn't itself the
  thing a `try` block already guards) must be wrapped in `try/catch` with a rendered error
  state - never let a mutation call reject uncaught.
- Backend must be running for manual verification: `cd apps/api && source .venv/bin/activate
  && uvicorn app.main:asgi_app --reload --port 4000` (serve `asgi_app`, not `app` - `app`
  alone is missing the outer CORS wrap a prior plan added for unhandled-error responses).
- Every scene-node/choice-option API call goes through the existing `/api/admin/scene-nodes`
  and `/api/admin/choice-options` endpoints (`apps/api/app/routers/scenes.py`) - already
  built, tested, and merged; this plan is frontend-only.

## Out of scope for this plan

Chapter preview (walking a draft chapter through `POST /api/admin/preview/...` without
touching real player data) and the wardrobe/outfit sprite-matrix uploader (upgrading the
single "neutral" sprite slot from the prior plan into a full expression×outfit grid) are
separate, later plans - both build on this editor existing first (preview needs real scene
content to walk through; the sprite matrix is an enhancement to the already-shipped
character upload widget, unrelated to scene editing itself).

---

## Task 1: Scene node/choice-option types + navigation entry point

**Files:**
- Modify: `apps/admin/lib/types.ts` (add `SceneNodeOut`, `ChoiceOptionOut`)
- Modify: `apps/admin/app/(app)/stories/[id]/page.tsx` (add a link from each chapter row to
  its scene editor)

**Interfaces:**
- Produces: `SceneNodeOut`, `ChoiceOptionOut` types - every later task in this plan imports
  them from `lib/types.ts`.

- [ ] **Step 1: Add the response types**

In `apps/admin/lib/types.ts`, add (mirrors `apps/api/app/schemas/responses.py`'s
`SceneNodeOut`/`ChoiceOptionOut` field-for-field, camelCase):

```typescript
export type ChoiceOptionOut = {
  id: string;
  nodeId: string;
  order: number;
  text: LocalizedText;
  costCurrency: "SOFT" | "HARD" | null;
  costAmount: number;
  visibleWhen: Array<{ variableKey: string; characterId: string | null; operator: string; value: number | boolean | string }>;
  effects: Array<{ variableKey: string; characterId: string | null; op: string; value: number | boolean | string }>;
  nextNodeId: string | null;
};

export type SceneNodeOut = {
  id: string;
  chapterId: string;
  type: "DIALOGUE" | "CHOICE" | "CONDITION" | "EFFECT" | "END";
  order: number;
  data: Record<string, unknown>;
  canvasX: number | null;
  canvasY: number | null;
  choiceOptions: ChoiceOptionOut[];
};
```

- [ ] **Step 2: Link each chapter to its scene editor**

In `apps/admin/app/(app)/stories/[id]/page.tsx`'s `ChaptersList` component, add a link next
to the existing "Опубликовать"/"Снять с публикации" button in each chapter's `<li>`:

```tsx
            <Link href={`/stories/${season.storyId}/chapters/${chapter.id}`} className="text-neutral-600 underline">
              Редактировать содержание
            </Link>
```

(`season.storyId` is already a prop field on `StoryDetailOut["seasons"][number]` from Task 4
of the prior plan.) Add `import Link from "next/link";` to the top of the file if it isn't
already imported there (check first - the file may already import it from an earlier task).

- [ ] **Step 3: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `lint` - clean.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/lib/types.ts "apps/admin/app/(app)/stories/[id]/page.tsx"
git commit -m "feat(admin): scene node/choice-option types, link chapters to their editor"
```

---

## Task 2: Scene editor page - list view, node create/delete, entry-node selection

**Files:**
- Create: `apps/admin/lib/scene-nodes.ts`
- Create: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx`

**Interfaces:**
- Consumes: `SceneNodeOut`, `ChoiceOptionOut` (Task 1)
- Produces: the page component itself, plus `NODE_TYPE_LABELS`/`nodeSummary(node)` in a new
  `apps/admin/lib/scene-nodes.ts` (deliberately NOT exported from the page file itself -
  importing named exports from a dynamic-route `page.tsx` works in plain Next.js but is
  fragile enough not to build on; a small shared lib module is the safe, conventional home).
  Task 5 (graph view) imports both from `lib/scene-nodes.ts`.

- [ ] **Step 1: Shared node-type label/summary helpers**

`apps/admin/lib/scene-nodes.ts`:

```typescript
import type { SceneNodeOut } from "./types";

export const NODE_TYPE_LABELS: Record<SceneNodeOut["type"], string> = {
  DIALOGUE: "Диалог",
  CHOICE: "Выбор",
  CONDITION: "Условие",
  EFFECT: "Эффект",
  END: "Конец",
};

/** One-line summary of a node's content for the list/graph views - never throws on
 * malformed `data` (a node mid-edit, or fetched before validation), falls back to an empty
 * string. */
export function nodeSummary(node: SceneNodeOut): string {
  try {
    switch (node.type) {
      case "DIALOGUE":
        return String((node.data as { text?: { ru?: string } }).text?.ru ?? "");
      case "CHOICE":
        return String((node.data as { prompt?: { ru?: string } }).prompt?.ru ?? "(без подсказки)");
      case "CONDITION":
        return "если … иначе …";
      case "EFFECT":
        return `${((node.data as { effects?: unknown[] }).effects ?? []).length} эффект(ов)`;
      case "END":
        return "Конец главы";
    }
  } catch {
    return "";
  }
}
```

- [ ] **Step 2: Page scaffold - fetch chapter + nodes, list view, add/delete node**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { apiRequest, ApiError } from "@/lib/api";
import { NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";
import type { ChapterOut, CharacterOut, SceneNodeOut } from "@/lib/types";

export default function SceneEditorPage() {
  const { id: storyId, chapterId } = useParams<{ id: string; chapterId: string }>();
  const [chapter, setChapter] = useState<ChapterOut | null>(null);
  const [nodes, setNodes] = useState<SceneNodeOut[]>([]);
  const [characters, setCharacters] = useState<CharacterOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [chapterData, nodesData, charactersData] = await Promise.all([
        apiRequest<ChapterOut>(`/admin/chapters/${chapterId}`),
        apiRequest<SceneNodeOut[]>(`/admin/scene-nodes?chapterId=${chapterId}`),
        apiRequest<CharacterOut[]>(`/admin/characters?storyId=${storyId}`),
      ]);
      setChapter(chapterData);
      setNodes(nodesData);
      setCharacters(charactersData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить главу");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; rule flags React's own canonical pattern regardless of await timing
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const [mutationError, setMutationError] = useState<string | null>(null);

  const onCreateNode = async (type: SceneNodeOut["type"]) => {
    const defaultDataByType: Record<SceneNodeOut["type"], object> = {
      DIALOGUE: { text: { ru: "…" } },
      CHOICE: {},
      CONDITION: { when: [] },
      EFFECT: { effects: [] },
      END: {},
    };
    try {
      await apiRequest("/admin/scene-nodes", {
        method: "POST",
        body: JSON.stringify({
          type,
          chapterId,
          order: nodes.length,
          data: defaultDataByType[type],
        }),
      });
      load();
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Не удалось создать узел");
    }
  };

  const onDeleteNode = async (nodeId: string) => {
    if (!confirm("Удалить узел? Это необратимо.")) return;
    try {
      await apiRequest(`/admin/scene-nodes/${nodeId}`, { method: "DELETE" });
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      load();
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Не удалось удалить узел");
    }
  };

  const onSetEntryNode = async (nodeId: string) => {
    try {
      await apiRequest(`/admin/chapters/${chapterId}`, {
        method: "PATCH",
        body: JSON.stringify({ entryNodeId: nodeId }),
      });
      load();
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Не удалось задать начальную сцену");
    }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!chapter) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Глава {chapter.index}: {chapter.title.ru}
        </h1>
        <p className="text-sm text-neutral-500">
          {chapter.status}
          {!chapter.entryNodeId && " · начальная сцена не задана"}
        </p>
      </div>

      {mutationError && <p className="text-sm text-red-600">{mutationError}</p>}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(NODE_TYPE_LABELS) as SceneNodeOut["type"][]).map((type) => (
          <button
            key={type}
            onClick={() => onCreateNode(type)}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          >
            + {NODE_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
        {nodes
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((node) => (
            <li key={node.id}>
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() => setSelectedNodeId(selectedNodeId === node.id ? null : node.id)}
                  className="flex-1 text-left"
                >
                  <span className="mr-2 rounded bg-neutral-100 px-2 py-0.5 text-xs">
                    {NODE_TYPE_LABELS[node.type]}
                  </span>
                  <span className="text-sm">{nodeSummary(node)}</span>
                  {chapter.entryNodeId === node.id && (
                    <span className="ml-2 text-xs text-green-700">начальная сцена</span>
                  )}
                </button>
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
              </div>
              {selectedNodeId === node.id && (
                <div className="border-t border-neutral-100 bg-neutral-50 p-4">
                  {/* NodeEditorPanel goes here - added in Task 3 */}
                </div>
              )}
            </li>
          ))}
        {nodes.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">Пока нет узлов</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `lint` - clean.

Manual check (backend running): open a story's chapter via the new "Редактировать
содержание" link, add one of each node type via the buttons, confirm they appear in the
list with the right type label, delete one, mark one as the entry scene (confirm the chapter
subtitle updates and the "начальная сцена" tag moves).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/lib/scene-nodes.ts "apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx"
git commit -m "feat(admin): scene editor list view - create/delete nodes, set entry scene"
```

---

## Task 3: Node edit form (all five node types)

**Files:**
- Create: `apps/admin/components/EffectRowsEditor.tsx`
- Create: `apps/admin/components/NodeEditorPanel.tsx`
- Modify: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx` (wire the panel in)

**Interfaces:**
- Consumes: `SceneNodeOut`, `ChoiceOptionOut`, `CharacterOut` (Task 1/prior plan),
  `dialogueNodeDataSchema`/`choiceNodeDataSchema`/`conditionNodeDataSchema`/
  `effectNodeDataSchema`/`endNodeDataSchema`/`sceneNodeUpdateSchema` (`@arcana/shared`)
- Produces: `<NodeEditorPanel node={...} allNodes={...} characters={...} onSaved={...}
  onClose={...} />` - Task 4 extends this same file to add the choice-options sub-section for
  `CHOICE` nodes; Task 5 (graph view) renders this exact component in a sidebar instead of
  inline.

- [ ] **Step 1: A small reusable effects/conditions row editor**

Both `EFFECT` node data and choice options' `effects` field need the same
"list of `{variableKey, characterId, op/operator, value}` rows, add/remove" UI. Extract it
once:

`apps/admin/components/EffectRowsEditor.tsx`:

```tsx
"use client";

type Row = { variableKey: string; characterId: string | null; op: string; value: string };

const OPS = ["SET", "INCREMENT", "DECREMENT"];

/** Parses a free-text value input into the number/boolean/string the backend's
 * `VariableScalar` union expects - "true"/"false" become booleans, anything that parses as
 * a finite number becomes a number, everything else stays a string. This is a deliberate v1
 * simplification (no per-variable type lookup) - see the plan's Task 3 note. */
function parseValue(raw: string): number | boolean | string {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const asNumber = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(asNumber)) return asNumber;
  return raw;
}

export function EffectRowsEditor({
  rows,
  onChange,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
}) {
  const update = (index: number, patch: Partial<Row>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 p-2 text-sm">
          <input
            value={row.variableKey}
            onChange={(e) => update(i, { variableKey: e.target.value })}
            placeholder="ключ переменной"
            className="w-32 rounded border border-neutral-300 px-2 py-1"
          />
          <select
            value={row.op}
            onChange={(e) => update(i, { op: e.target.value })}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="значение"
            className="w-24 rounded border border-neutral-300 px-2 py-1"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="text-red-600 underline"
          >
            Удалить
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { variableKey: "", characterId: null, op: "SET", value: "" }])}
        className="text-sm text-neutral-600 underline"
      >
        + Добавить эффект
      </button>
    </div>
  );
}

export { parseValue };
export type { Row as EffectRow };
```

- [ ] **Step 2: The node editor panel**

`apps/admin/components/NodeEditorPanel.tsx`:

```tsx
"use client";

import { useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type { CharacterOut, SceneNodeOut } from "@/lib/types";
import { EffectRowsEditor, parseValue, type EffectRow } from "./EffectRowsEditor";

function NextNodeSelect({
  value,
  allNodes,
  excludeNodeId,
  onChange,
}: {
  value: string | null;
  allNodes: SceneNodeOut[];
  excludeNodeId: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
    >
      <option value="">(нет продолжения)</option>
      {allNodes
        .filter((n) => n.id !== excludeNodeId)
        .map((n) => (
          <option key={n.id} value={n.id}>
            {n.type} · {n.id.slice(0, 8)}
          </option>
        ))}
    </select>
  );
}

export function NodeEditorPanel({
  node,
  allNodes,
  characters,
  onSaved,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  characters: CharacterOut[];
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (data: object) => {
    setSaving(true);
    try {
      await apiRequest(`/admin/scene-nodes/${node.id}`, { method: "PATCH", body: JSON.stringify({ data }) });
      setError(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить узел");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {node.type === "DIALOGUE" && (
        <DialogueForm node={node} allNodes={allNodes} characters={characters} onSave={save} />
      )}
      {node.type === "CHOICE" && <ChoiceForm node={node} onSave={save} />}
      {node.type === "CONDITION" && <ConditionForm node={node} allNodes={allNodes} onSave={save} />}
      {node.type === "EFFECT" && <EffectForm node={node} allNodes={allNodes} onSave={save} />}
      {node.type === "END" && <EndForm node={node} onSave={save} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saving && <p className="text-sm text-neutral-500">Сохранение…</p>}
    </div>
  );
}

function DialogueForm({
  node,
  allNodes,
  characters,
  onSave,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  characters: CharacterOut[];
  onSave: (data: object) => void;
}) {
  const data = node.data as {
    speakerCharacterId?: string | null;
    text?: { ru?: string };
    isThought?: boolean;
    nextNodeId?: string | null;
  };
  const [speakerCharacterId, setSpeakerCharacterId] = useState<string | null>(data.speakerCharacterId ?? null);
  const [textRu, setTextRu] = useState(data.text?.ru ?? "");
  const [isThought, setIsThought] = useState(Boolean(data.isThought));
  const [nextNodeId, setNextNodeId] = useState<string | null>(data.nextNodeId ?? null);

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-neutral-600">Говорит</label>
        <select
          value={speakerCharacterId ?? ""}
          onChange={(e) => setSpeakerCharacterId(e.target.value || null)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">(рассказчик)</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name.ru}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-600">Текст</label>
        <textarea
          value={textRu}
          onChange={(e) => setTextRu(e.target.value)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          rows={3}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isThought} onChange={(e) => setIsThought(e.target.checked)} />
        Мысли (не речь)
      </label>
      <div>
        <label className="block text-xs text-neutral-600">Следующий узел</label>
        <NextNodeSelect value={nextNodeId} allNodes={allNodes} excludeNodeId={node.id} onChange={setNextNodeId} />
      </div>
      <button
        onClick={() =>
          onSave({
            ...node.data,
            speakerCharacterId,
            text: { ru: textRu },
            isThought,
            nextNodeId,
          })
        }
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
    </div>
  );
}

function ChoiceForm({ node, onSave }: { node: SceneNodeOut; onSave: (data: object) => void }) {
  const data = node.data as { prompt?: { ru?: string } };
  const [promptRu, setPromptRu] = useState(data.prompt?.ru ?? "");

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-neutral-600">Подсказка (необязательно)</label>
        <input
          value={promptRu}
          onChange={(e) => setPromptRu(e.target.value)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <button
        onClick={() => onSave(promptRu ? { prompt: { ru: promptRu } } : {})}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
      <p className="text-xs text-neutral-500">Варианты выбора редактируются ниже.</p>
    </div>
  );
}

function ConditionForm({
  node,
  allNodes,
  onSave,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  onSave: (data: object) => void;
}) {
  const data = node.data as {
    when?: Array<{ variableKey: string; characterId: string | null; operator: string; value: unknown }>;
    thenNodeId?: string | null;
    elseNodeId?: string | null;
  };
  const [rows, setRows] = useState<EffectRow[]>(
    (data.when ?? []).map((c) => ({
      variableKey: c.variableKey,
      characterId: c.characterId,
      op: c.operator,
      value: String(c.value),
    })),
  );
  const [thenNodeId, setThenNodeId] = useState<string | null>(data.thenNodeId ?? null);
  const [elseNodeId, setElseNodeId] = useState<string | null>(data.elseNodeId ?? null);

  return (
    <div className="space-y-2">
      <label className="block text-xs text-neutral-600">Условия (все должны выполняться)</label>
      <EffectRowsEditor rows={rows} onChange={setRows} />
      <div>
        <label className="block text-xs text-neutral-600">Если верно</label>
        <NextNodeSelect value={thenNodeId} allNodes={allNodes} excludeNodeId={node.id} onChange={setThenNodeId} />
      </div>
      <div>
        <label className="block text-xs text-neutral-600">Если неверно</label>
        <NextNodeSelect value={elseNodeId} allNodes={allNodes} excludeNodeId={node.id} onChange={setElseNodeId} />
      </div>
      <button
        onClick={() =>
          onSave({
            when: rows.map((r) => ({
              variableKey: r.variableKey,
              characterId: r.characterId,
              operator: r.op,
              value: parseValue(r.value),
            })),
            thenNodeId,
            elseNodeId,
          })
        }
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
    </div>
  );
}

function EffectForm({
  node,
  allNodes,
  onSave,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  onSave: (data: object) => void;
}) {
  const data = node.data as {
    effects?: Array<{ variableKey: string; characterId: string | null; op: string; value: unknown }>;
    nextNodeId?: string | null;
  };
  const [rows, setRows] = useState<EffectRow[]>(
    (data.effects ?? []).map((e) => ({
      variableKey: e.variableKey,
      characterId: e.characterId,
      op: e.op,
      value: String(e.value),
    })),
  );
  const [nextNodeId, setNextNodeId] = useState<string | null>(data.nextNodeId ?? null);

  return (
    <div className="space-y-2">
      <EffectRowsEditor rows={rows} onChange={setRows} />
      <div>
        <label className="block text-xs text-neutral-600">Следующий узел</label>
        <NextNodeSelect value={nextNodeId} allNodes={allNodes} excludeNodeId={node.id} onChange={setNextNodeId} />
      </div>
      <button
        onClick={() =>
          onSave({
            effects: rows.map((r) => ({
              variableKey: r.variableKey,
              characterId: r.characterId,
              op: r.op,
              value: parseValue(r.value),
            })),
            nextNodeId,
          })
        }
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
    </div>
  );
}

function EndForm({ node, onSave }: { node: SceneNodeOut; onSave: (data: object) => void }) {
  const data = node.data as { unlocksNextChapter?: boolean };
  const [unlocksNextChapter, setUnlocksNextChapter] = useState(data.unlocksNextChapter !== false);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={unlocksNextChapter}
          onChange={(e) => setUnlocksNextChapter(e.target.checked)}
        />
        Открывает следующую главу
      </label>
      <button
        onClick={() => onSave({ unlocksNextChapter })}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the list view**

In `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx`, add the import:

```tsx
import { NodeEditorPanel } from "@/components/NodeEditorPanel";
```

Replace the placeholder comment `{/* NodeEditorPanel goes here - added in Task 3 */}` with:

```tsx
                  <NodeEditorPanel
                    node={node}
                    allNodes={nodes}
                    characters={characters}
                    onSaved={load}
                  />
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `lint` - clean.

Manual check: click each node type in the list, confirm its form renders with the right
fields, edit and save a `DIALOGUE` node's text - confirm the list's one-line summary updates
after save. Set a `CONDITION` node's "если верно" to point at another node, save, reopen the
form, confirm the selection persisted.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/EffectRowsEditor.tsx apps/admin/components/NodeEditorPanel.tsx \
  "apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx"
git commit -m "feat(admin): node edit forms for all five scene node types"
```

---

## Task 4: Choice options CRUD

**Files:**
- Modify: `apps/admin/components/NodeEditorPanel.tsx` (`ChoiceForm` gains an options
  sub-section)

**Interfaces:**
- Consumes: `ChoiceOptionOut` (Task 1), `EffectRowsEditor`/`parseValue` (Task 3)
- Produces: nothing new consumed elsewhere - self-contained within `ChoiceForm`.

- [ ] **Step 1: Extend `ChoiceForm` with an options list + create/edit/delete**

Replace `ChoiceForm` in `apps/admin/components/NodeEditorPanel.tsx` with:

```tsx
function ChoiceForm({
  node,
  allNodes,
  onSave,
  onOptionsChanged,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  onSave: (data: object) => void;
  onOptionsChanged: () => void;
}) {
  const data = node.data as { prompt?: { ru?: string } };
  const [promptRu, setPromptRu] = useState(data.prompt?.ru ?? "");
  const [showCreateOption, setShowCreateOption] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-xs text-neutral-600">Подсказка (необязательно)</label>
        <input
          value={promptRu}
          onChange={(e) => setPromptRu(e.target.value)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          onClick={() => onSave(promptRu ? { prompt: { ru: promptRu } } : {})}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          Сохранить
        </button>
      </div>

      <div className="space-y-2 border-t border-neutral-200 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-600">Варианты выбора</span>
          <button onClick={() => setShowCreateOption((v) => !v)} className="text-xs text-neutral-600 underline">
            {showCreateOption ? "Отмена" : "+ Добавить вариант"}
          </button>
        </div>

        {showCreateOption && (
          <ChoiceOptionForm
            nodeId={node.id}
            allNodes={allNodes}
            order={node.choiceOptions.length}
            onSaved={() => {
              setShowCreateOption(false);
              onOptionsChanged();
            }}
          />
        )}

        {node.choiceOptions
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((option) => (
            <ChoiceOptionForm
              key={option.id}
              nodeId={node.id}
              allNodes={allNodes}
              existing={option}
              onSaved={onOptionsChanged}
            />
          ))}
        {node.choiceOptions.length === 0 && !showCreateOption && (
          <p className="text-xs text-neutral-500">Пока нет вариантов</p>
        )}
      </div>
    </div>
  );
}

function ChoiceOptionForm({
  nodeId,
  allNodes,
  existing,
  order,
  onSaved,
}: {
  nodeId: string;
  allNodes: SceneNodeOut[];
  existing?: ChoiceOptionOut;
  order?: number;
  onSaved: () => void;
}) {
  const [textRu, setTextRu] = useState(existing?.text.ru ?? "");
  const [costCurrency, setCostCurrency] = useState<"SOFT" | "HARD" | "">(existing?.costCurrency ?? "");
  const [costAmount, setCostAmount] = useState(existing?.costAmount ?? 0);
  const [nextNodeId, setNextNodeId] = useState<string | null>(existing?.nextNodeId ?? null);
  const [rows, setRows] = useState<EffectRow[]>(
    (existing?.effects ?? []).map((e) => ({
      variableKey: e.variableKey,
      characterId: e.characterId,
      op: e.op,
      value: String(e.value),
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const body = {
      text: { ru: textRu },
      costCurrency: costCurrency || null,
      costAmount,
      nextNodeId,
      effects: rows.map((r) => ({
        variableKey: r.variableKey,
        characterId: r.characterId,
        op: r.op,
        value: parseValue(r.value),
      })),
    };
    try {
      if (existing) {
        await apiRequest(`/admin/choice-options/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiRequest("/admin/choice-options", {
          method: "POST",
          body: JSON.stringify({ nodeId, order, visibleWhen: [], ...body }),
        });
      }
      setError(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить вариант");
    }
  };

  const remove = async () => {
    if (!existing || !confirm("Удалить вариант?")) return;
    try {
      await apiRequest(`/admin/choice-options/${existing.id}`, { method: "DELETE" });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить вариант");
    }
  };

  return (
    <div className="space-y-2 rounded border border-neutral-200 p-2">
      <input
        value={textRu}
        onChange={(e) => setTextRu(e.target.value)}
        placeholder="Текст варианта"
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2 text-sm">
        <select
          value={costCurrency}
          onChange={(e) => setCostCurrency(e.target.value as "SOFT" | "HARD" | "")}
          className="rounded border border-neutral-300 px-2 py-1"
        >
          <option value="">Бесплатно</option>
          <option value="SOFT">Монеты</option>
          <option value="HARD">Кристаллы</option>
        </select>
        {costCurrency && (
          <input
            type="number"
            value={costAmount}
            onChange={(e) => setCostAmount(Number(e.target.value))}
            className="w-20 rounded border border-neutral-300 px-2 py-1"
          />
        )}
      </div>
      <NextNodeSelect value={nextNodeId} allNodes={allNodes} excludeNodeId={nodeId} onChange={setNextNodeId} />
      <EffectRowsEditor rows={rows} onChange={setRows} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} className="rounded bg-neutral-900 px-3 py-1 text-xs text-white">
          Сохранить
        </button>
        {existing && (
          <button onClick={remove} className="text-xs text-red-600 underline">
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}
```

Add `ChoiceOptionOut` to the existing `import type { CharacterOut, SceneNodeOut } from
"@/lib/types";` line at the top of the file (becomes `import type { ChoiceOptionOut,
CharacterOut, SceneNodeOut } from "@/lib/types";`).

- [ ] **Step 2: Thread `onOptionsChanged` through `NodeEditorPanel`**

`NodeEditorPanel`'s own render of `<ChoiceForm node={node} onSave={save} />` needs to become
`<ChoiceForm node={node} allNodes={allNodes} onSave={save} onOptionsChanged={onSaved} />` -
`onSaved` (the prop `NodeEditorPanel` already receives) is exactly the "reload the chapter's
nodes" callback the options list needs after a create/edit/delete, since `node.choiceOptions`
comes from the parent's re-fetched node list.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `lint` - clean.

Manual check: open a `CHOICE` node, add two options with different costs/next-nodes, confirm
both appear and persist after reload, delete one, edit the other's text and confirm it saves.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/NodeEditorPanel.tsx
git commit -m "feat(admin): choice option create/edit/delete within CHOICE nodes"
```

---

## Task 5: Graph view (React Flow)

**Files:**
- Modify: `apps/admin/package.json` (add `@xyflow/react`)
- Create: `apps/admin/components/SceneGraphView.tsx`
- Modify: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx` (add a
  List/Graph toggle, render `SceneGraphView` when Graph is selected)

**Interfaces:**
- Consumes: `SceneNodeOut`, `NODE_TYPE_LABELS`/`nodeSummary` (Task 2),
  `NodeEditorPanel` (Task 3/4)
- Produces: `<SceneGraphView nodes={...} characters={...} onNodesChanged={...} />` - the
  final piece of this plan.

- [ ] **Step 1: Install React Flow**

Run: `pnpm --filter @arcana/admin add @xyflow/react`

- [ ] **Step 2: The graph component**

`apps/admin/components/SceneGraphView.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeChange,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { apiRequest, ApiError } from "@/lib/api";
import { NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";
import type { CharacterOut, SceneNodeOut } from "@/lib/types";
import { NodeEditorPanel } from "./NodeEditorPanel";

/** Every edge a scene node's `data` can imply, across all five node types - one place that
 * knows how to turn "what this node points at" into graph edges, so the graph view doesn't
 * need type-specific branching scattered elsewhere. */
function edgesForNode(node: SceneNodeOut): Edge[] {
  const d = node.data as Record<string, unknown>;
  const edges: Edge[] = [];
  const addEdge = (targetId: unknown, label?: string) => {
    if (typeof targetId === "string" && targetId) {
      edges.push({
        id: `${node.id}-${targetId}-${label ?? ""}`,
        source: node.id,
        target: targetId,
        label,
      });
    }
  };

  if (node.type === "DIALOGUE" || node.type === "EFFECT") addEdge(d.nextNodeId);
  if (node.type === "CONDITION") {
    addEdge(d.thenNodeId, "да");
    addEdge(d.elseNodeId, "нет");
  }
  if (node.type === "CHOICE") {
    for (const option of node.choiceOptions) {
      addEdge(option.nextNodeId, option.text.ru.slice(0, 20));
    }
  }
  return edges;
}

export function SceneGraphView({
  nodes: sceneNodes,
  characters,
  onNodesChanged,
}: {
  nodes: SceneNodeOut[];
  characters: CharacterOut[];
  onNodesChanged: () => void;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const flowNodes = useMemo<Node[]>(
    () =>
      sceneNodes.map((n, i) => ({
        id: n.id,
        position: { x: n.canvasX ?? (i % 5) * 220, y: n.canvasY ?? Math.floor(i / 5) * 140 },
        data: { label: `${NODE_TYPE_LABELS[n.type]}\n${nodeSummary(n)}` },
        style: { whiteSpace: "pre-line" as const, fontSize: 12, width: 180 },
      })),
    [sceneNodes],
  );

  const flowEdges = useMemo<Edge[]>(() => sceneNodes.flatMap(edgesForNode), [sceneNodes]);

  // Local, mutable copy of the graph's node positions - React Flow is a controlled
  // component (it needs `nodes` state it can apply drag changes to via `onNodesChange`
  // before a drag ends), so this can't just be `flowNodes` directly. Resynced whenever a
  // reload produces a genuinely new `flowNodes` (e.g. after a save elsewhere changes node
  // content), not on every render.
  const [localNodes, setLocalNodes] = useState<Node[]>(flowNodes);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing controlled
    // React Flow node state from the `sceneNodes` prop after a reload, not a fetch itself,
    // but the same rule flags any setState reachable from an effect regardless of shape.
    setLocalNodes(flowNodes);
  }, [flowNodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setLocalNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onNodeDragStop = useCallback(async (_: unknown, node: Node) => {
    try {
      await apiRequest(`/admin/scene-nodes/${node.id}`, {
        method: "PATCH",
        body: JSON.stringify({ canvasX: Math.round(node.position.x), canvasY: Math.round(node.position.y) }),
      });
    } catch {
      // Position persistence failing isn't worth blocking the drag interaction over - the
      // node just won't remember its spot on next load. Silent by design here (not a data
      // change that needs the same error-surface rigor as content mutations).
    }
  }, []);

  const selectedNode = sceneNodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex h-[600px] gap-4">
      <div className="flex-1 rounded border border-neutral-200">
        <ReactFlow
          nodes={localNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      {selectedNode && (
        <div className="w-80 shrink-0 overflow-y-auto rounded border border-neutral-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{NODE_TYPE_LABELS[selectedNode.type]}</span>
            <button onClick={() => setSelectedNodeId(null)} className="text-xs text-neutral-500 underline">
              Закрыть
            </button>
          </div>
          <NodeEditorPanel
            node={selectedNode}
            allNodes={sceneNodes}
            characters={characters}
            onSaved={onNodesChanged}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the List/Graph toggle to the editor page**

In `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx`:

Add the import: `import { SceneGraphView } from "@/components/SceneGraphView";`

Add state near the top of `SceneEditorPage`: `const [view, setView] = useState<"list" |
"graph">("list");`

Add a toggle in the JSX, right after the node-type-creation button row:

```tsx
      <div className="flex gap-2 text-sm">
        <button
          onClick={() => setView("list")}
          className={view === "list" ? "font-semibold underline" : "text-neutral-600"}
        >
          Список
        </button>
        <button
          onClick={() => setView("graph")}
          className={view === "graph" ? "font-semibold underline" : "text-neutral-600"}
        >
          Граф
        </button>
      </div>
```

Wrap the existing `<ul>...</ul>` node list in `{view === "list" && (...)}`, and add right
after it:

```tsx
      {view === "graph" && (
        <SceneGraphView nodes={nodes} characters={characters} onNodesChanged={load} />
      )}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @arcana/admin typecheck` and `lint` - clean.

Manual check: switch to "Граф", confirm every node from the list appears as a graph node,
confirm edges are drawn correctly for a `CONDITION` node's two branches and a `CHOICE`
node's options, drag a node to a new position, reload the page, switch back to Graph, confirm
the position persisted (`canvasX`/`canvasY` round-tripped). Click a node in the graph, confirm
the same edit panel opens in the sidebar and saves correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml apps/admin/components/SceneGraphView.tsx \
  "apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx"
git commit -m "feat(admin): scene graph view (React Flow) over the same node data"
```

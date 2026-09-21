# Chapter Graph Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the chapter editor's "Граф" tab from a read-mostly visualization into the primary way to construct a chapter — create nodes by clicking the canvas, wire branches by dragging connections — while keeping the sticky quick-add toolbar for fast linear work, moving character management into the chapter editor itself, and making cross-chapter/cross-season variable dependencies (a choice in S1E5 affecting S2E4) visible and navigable.

**Architecture:** Almost everything here is additive to `apps/admin` — no `condition_engine.py` changes, no new `SceneNodeType`, every node the canvas creates goes through the existing `POST /admin/scene-nodes` / `POST /admin/choice-options` / `PATCH` endpoints. The one backend addition is a new read-only endpoint that walks a story's existing node data to answer "where is this variable set/checked" — it doesn't touch the reading engine, just narrates what's already there.

**Tech Stack:** Next.js 16 admin panel (unchanged), `@xyflow/react` v12 (already a dependency, used by the existing `SceneGraphView.tsx`) for the interactive canvas, FastAPI + SQLAlchemy 2.0 async for the new backend endpoint.

**Spec:** `docs/superpowers/specs/2026-09-21-chapter-graph-editor-design.md` — read it first for the full rationale and the worked examples (multi-branch CHOICE, S1E5→S2E4 variable dependency) this plan implements against.

## Global Constraints

- **No `condition_engine.py` changes, no new `SceneNodeType`.** Every node/connection the canvas creates or edits goes through the existing content-authoring endpoints (`/admin/scene-nodes`, `/admin/choice-options`).
- **Output handles per node type are fixed by the engine's own routing fields** — do not invent new ones: DIALOGUE/EFFECT → one handle → `data.nextNodeId`; CONDITION → two handles ("да"/"нет") → `data.thenNodeId`/`data.elseNodeId`; CHOICE → one handle per current `ChoiceOption` → that option's own `nextNodeId`; END → zero handles.
- **`order` is no longer the source of truth for "what comes next"** — it stays only as the `Список` view's sort key and as a fallback for creating a brand-new node with no explicit chain target (`nextOrder()`, already in `page.tsx`). Never make new logic depend on `order` to find "the next node" — follow the explicit link fields instead, exactly like the reading engine already does.
- **Node deletion stays protected** (`deleteKeyCode={null}` on `<ReactFlow>`) — only edge deletion becomes available via an explicit UI action (click edge → delete button), never a keyboard shortcut, to avoid the same accidental-data-loss risk this project has deliberately guarded against everywhere else.
- **A dangling connection (target node deleted elsewhere) is not an error** — matches this codebase's established "тихая деградация, не 500" convention; React Flow already doesn't render an edge whose target isn't in the current `nodes` array, so no explicit handling is needed for this, just don't add validation that would turn it into an error.
- **All new Pydantic schemas use `CamelModel`**; all new frontend types/components match this file's existing Tailwind utility conventions (see `QuickAddToolbar.tsx`/`SceneGraphView.tsx` for the established look).
- **No test runner for `apps/admin`** — verification is `pnpm --filter @arcana/admin typecheck && lint && build`, plus a live `orca` walkthrough for every visual task. `apps/api` uses `pytest` (TDD), exactly as every other backend task in this repo's history.
- **Design skills (repo CLAUDE.md):** every visual task in this plan runs `Skill critique` then `Skill polish` before being marked done — either via a literal `Skill()` tool call, or by reading the skill's own SKILL.md/reference content directly and following its concrete steps as a genuinely separate, itemized pass (this exact allowance was established and re-confirmed twice on the prior `chapter-quick-builder` branch — cite real script output/scores, don't reproduce from memory). This is the single most-repeated finding across that branch's reviews; do not repeat it here.
- **Commit convention:** every task ends with a commit `feat(admin): ...` / `feat(api): ...` as appropriate, trailer lines:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_0127Wv27WYY5D3o1FAgto5jA`.

---

### Task 1: Backend — variable-usages endpoint

**Files:**
- Modify: `apps/api/app/routers/stories.py` (new route)
- Create: `apps/api/app/services/variable_usage_service.py`
- Modify: `apps/api/app/schemas/responses.py` (new response models)
- Create: `apps/api/tests/test_variable_usages.py`

**Interfaces:**
- Consumes: `Story.seasons[].chapters[].nodes[].choice_options[]` (existing ORM relationships, `apps/api/app/models/content.py`), `Effect`/`Condition`/`ConditionGroup`/`EffectList` (existing, `apps/api/app/schemas/common.py` — flat lists, no nested AND/OR groups to worry about).
- Produces: `GET /admin/stories/{story_id}/variable-usages` → `list[VariableUsageOut]`, each `{definition: VariableDefinitionOut, usages: list[VariableUsageEntry]}`, `VariableUsageEntry = {chapterId, chapterTitle: LocalizedText, seasonIndex: int, chapterIndex: int, nodeId, nodeType, role: "sets" | "reads"}`. Task 7 (frontend Variables tab) consumes this verbatim.

- [ ] **Step 1: Write the failing tests**

Read `apps/api/tests/conftest.py`'s `make_story`/`make_character`/`make_chapter` fixtures (added by earlier work on this codebase) before writing these — reuse them, don't reinvent.

```python
# apps/api/tests/test_variable_usages.py
from app.models.content import ChoiceOption, SceneNode, VariableDefinition
from app.models.enums import SceneNodeType


async def test_variable_usage_across_seasons(
    client, make_user, auth_headers, make_story, db_session
):
    writer = await make_user("writer-varusage@example.com", role="WRITER")
    story = await make_story()

    definition = VariableDefinition(
        story_id=story.id, key="spared_villain", label={"ru": "Пощадил злодея"},
        type="BOOLEAN", default_value=False, character_id=None,
    )
    db_session.add(definition)
    await db_session.flush()

    # Season 1 / chapter 5: an EFFECT node that SETs the variable.
    from app.models.content import Chapter, Season

    season1 = Season(story_id=story.id, index=1, title={"ru": "Сезон 1"})
    db_session.add(season1)
    await db_session.flush()
    chapter5 = Chapter(season_id=season1.id, index=5, title={"ru": "Серия 5"})
    db_session.add(chapter5)
    await db_session.flush()
    effect_node = SceneNode(
        chapter_id=chapter5.id, type=SceneNodeType.EFFECT, order=0,
        data={"effects": [{"variableKey": "spared_villain", "characterId": None, "op": "SET", "value": True}]},
    )
    db_session.add(effect_node)

    # Season 2 / chapter 4: a CONDITION node that reads it, plus a CHOICE option that also reads
    # it via visibleWhen, and one that sets a *different* effect (should not appear as a usage
    # for THIS definition).
    season2 = Season(story_id=story.id, index=2, title={"ru": "Сезон 2"})
    db_session.add(season2)
    await db_session.flush()
    chapter4 = Chapter(season_id=season2.id, index=4, title={"ru": "Серия 4"})
    db_session.add(chapter4)
    await db_session.flush()
    condition_node = SceneNode(
        chapter_id=chapter4.id, type=SceneNodeType.CONDITION, order=0,
        data={"when": [{"variableKey": "spared_villain", "characterId": None, "operator": "EQUALS", "value": True}],
              "thenNodeId": None, "elseNodeId": None},
    )
    db_session.add(condition_node)
    choice_node = SceneNode(chapter_id=chapter4.id, type=SceneNodeType.CHOICE, order=1, data={})
    db_session.add(choice_node)
    await db_session.flush()
    reading_option = ChoiceOption(
        node_id=choice_node.id, order=0, text={"ru": "..."},
        visible_when=[{"variableKey": "spared_villain", "characterId": None, "operator": "EQUALS", "value": True}],
        effects=[], next_node_id=None,
    )
    unrelated_option = ChoiceOption(
        node_id=choice_node.id, order=1, text={"ru": "..."},
        visible_when=[], effects=[{"variableKey": "other_var", "characterId": None, "op": "SET", "value": 1}],
        next_node_id=None,
    )
    db_session.add_all([reading_option, unrelated_option])
    await db_session.commit()

    response = await client.get(
        f"/api/admin/stories/{story.id}/variable-usages", headers=auth_headers(writer)
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    entry = body[0]
    assert entry["definition"]["key"] == "spared_villain"

    usages = entry["usages"]
    assert len(usages) == 3  # EFFECT sets it, CONDITION reads it, one CHOICE option reads it
    by_role = {"sets": 0, "reads": 0}
    for usage in usages:
        by_role[usage["role"]] += 1
    assert by_role == {"sets": 1, "reads": 2}

    sets_entry = next(u for u in usages if u["role"] == "sets")
    assert sets_entry["seasonIndex"] == 1
    assert sets_entry["chapterIndex"] == 5
    assert sets_entry["nodeId"] == str(effect_node.id)
    assert sets_entry["nodeType"] == "EFFECT"

    reads_entries = [u for u in usages if u["role"] == "reads"]
    assert {u["seasonIndex"] for u in reads_entries} == {2}
    assert {u["chapterIndex"] for u in reads_entries} == {4}
    assert {u["nodeType"] for u in reads_entries} == {"CONDITION", "CHOICE"}


async def test_variable_usage_empty_story_returns_empty_list(
    client, make_user, auth_headers, make_story
):
    writer = await make_user("writer-varusage-empty@example.com", role="WRITER")
    story = await make_story()

    response = await client.get(
        f"/api/admin/stories/{story.id}/variable-usages", headers=auth_headers(writer)
    )
    assert response.status_code == 200
    assert response.json() == []


async def test_variable_usage_definition_with_zero_usages_still_listed(
    client, make_user, auth_headers, make_story, db_session
):
    writer = await make_user("writer-varusage-unused@example.com", role="WRITER")
    story = await make_story()
    definition = VariableDefinition(
        story_id=story.id, key="never_used", label={"ru": "Пока нигде не используется"},
        type="NUMBER", default_value=0, character_id=None,
    )
    db_session.add(definition)
    await db_session.commit()

    response = await client.get(
        f"/api/admin/stories/{story.id}/variable-usages", headers=auth_headers(writer)
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["definition"]["key"] == "never_used"
    assert body[0]["usages"] == []
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
cd apps/api && source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_variable_usages.py -v
```
Expected: 404 (route doesn't exist yet).

- [ ] **Step 3: Add response schemas**

`apps/api/app/schemas/responses.py`, near `VariableDefinitionOut`:
```python
class VariableUsageEntry(CamelModel):
    chapter_id: uuid.UUID
    chapter_title: LocalizedText
    season_index: int
    chapter_index: int
    node_id: uuid.UUID
    node_type: str
    role: Literal["sets", "reads"]


class VariableUsageOut(CamelModel):
    definition: VariableDefinitionOut
    usages: list[VariableUsageEntry]
```
Add `Literal` to the file's imports from `typing` if not already present (check the top of the file — several other schemas in this codebase already use `Literal`, e.g. `StagedCharacter.position`).

- [ ] **Step 4: Write the service**

`apps/api/app/services/variable_usage_service.py`:
```python
"""Read-only: walks a story's existing scene-node data to answer "where is this variable
defined, set, and checked" - across every season/chapter, not just the one currently open in
the admin panel. Does not touch the reading engine; this is authoring-time narration of data
that already drives `condition_engine.py` at play time.

Deliberately walks in Python rather than a JSONB SQL query: `Effect`/`Condition` appear in
different shapes on different node types (EFFECT.effects, CONDITION.when, ChoiceOption.
visible_when/effects) and a single JSONB path query covering all of them would be more fragile
than reading the small number of nodes a typical story has (hundreds, not millions) directly.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import Chapter, Season, SceneNode, Story, VariableDefinition


async def list_usages(db: AsyncSession, story_id: str) -> list[dict]:
    story = await db.scalar(
        select(Story)
        .where(Story.id == story_id)
        .options(
            selectinload(Story.variable_definitions),
            selectinload(Story.seasons)
            .selectinload(Season.chapters)
            .selectinload(Chapter.nodes)
            .selectinload(SceneNode.choice_options),
        )
    )
    if not story:
        return []

    # (variable_key, character_id) -> list of usage dicts, built once by a single pass over
    # every node/option in the story, then grouped per-definition below.
    usages_by_key: dict[tuple[str, str | None], list[dict]] = {}

    def record(variable_key: str, character_id: str | None, role: str, chapter: Chapter, season: Season, node: SceneNode) -> None:
        key = (variable_key, character_id)
        usages_by_key.setdefault(key, []).append(
            {
                "chapter_id": chapter.id,
                "chapter_title": chapter.title,
                "season_index": season.index,
                "chapter_index": chapter.index,
                "node_id": node.id,
                "node_type": node.type.value,
                "role": role,
            }
        )

    for season in story.seasons:
        for chapter in season.chapters:
            for node in chapter.nodes:
                data = node.data or {}
                if node.type.value == "EFFECT":
                    for effect in data.get("effects", []):
                        record(effect["variableKey"], effect.get("characterId"), "sets", chapter, season, node)
                elif node.type.value == "CONDITION":
                    for condition in data.get("when", []):
                        record(condition["variableKey"], condition.get("characterId"), "reads", chapter, season, node)
                elif node.type.value == "CHOICE":
                    for option in node.choice_options:
                        for condition in option.visible_when or []:
                            record(condition["variableKey"], condition.get("characterId"), "reads", chapter, season, node)
                        for effect in option.effects or []:
                            record(effect["variableKey"], effect.get("characterId"), "sets", chapter, season, node)

    result = []
    for definition in story.variable_definitions:
        key = (definition.key, str(definition.character_id) if definition.character_id else None)
        result.append({"definition": definition, "usages": usages_by_key.get(key, [])})
    return result
```
Note the `character_id` comparison: `VariableDefinition.character_id` is a `uuid.UUID | None` column, while `Effect.character_id`/`Condition.character_id` in the JSON are plain strings (or `None`) — the `str(definition.character_id) if ... else None` normalizes both sides to `str | None` before comparing as dict keys.

- [ ] **Step 5: Add the route**

`apps/api/app/routers/stories.py` — add near the other `/stories/{story_id}/...` routes:
```python
from app.schemas.responses import VariableUsageOut  # add to the existing responses import block
from app.services import variable_usage_service  # add to the existing services import block

@router.get("/stories/{story_id}/variable-usages", response_model=list[VariableUsageOut])
async def list_variable_usages(story_id: str, db: AsyncSession = Depends(get_db)):
    return await variable_usage_service.list_usages(db, story_id)
```

- [ ] **Step 6: Run the tests, confirm green, then the full suite**

```bash
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_variable_usages.py -v
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest
ruff check app seed.py tests && ruff format app seed.py tests
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/app/routers/stories.py apps/api/app/services/variable_usage_service.py apps/api/app/schemas/responses.py apps/api/tests/test_variable_usages.py
git commit -m "feat(api): variable-usages endpoint - where a story's variables are set/checked

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0127Wv27WYY5D3o1FAgto5jA"
```

---

### Task 2: Extract CharactersSection + add a «Персонажи» tab to the chapter editor

**Files:**
- Create: `apps/admin/components/CharactersSection.tsx` (moved out of the story page)
- Modify: `apps/admin/app/(app)/stories/[id]/page.tsx` (import instead of module-scoped function; pass `story.variableDefinitions` as today)
- Modify: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx` (new "Персонажи" tab)
- Modify: `apps/admin/lib/types.ts` (no change expected — `CharacterOut`/`VariableDefinitionOut` already exist; confirm during implementation)

**Interfaces:**
- Consumes: nothing new — `CharactersSection` already receives `{storyId, characters, variableDefinitions, onChanged}` (all already available on both pages: the story page has `story.characters`/`story.variableDefinitions`; the chapter editor page already loads `characters` via `GET /admin/characters?storyId=...` in its own `load()`, but does NOT currently load `variableDefinitions` — this task adds that fetch).
- Produces: `CharactersSection` becomes an exported, reusable component (`export function CharactersSection(...)`) callable from any page, not a module-private function of the story page.

- [ ] **Step 1: Read the current `CharactersSection` in full**

Read `apps/admin/app/(app)/stories/[id]/page.tsx`'s `CharactersSection` function (starts at line ~300 as of this plan's writing — confirm the current line since Task 1/earlier work may have shifted it) end to end, including its full JSX return block, before moving anything.

- [ ] **Step 2: Move it verbatim into its own file**

Create `apps/admin/components/CharactersSection.tsx`:
```tsx
"use client";

import { useState } from "react";
import { characterCreateSchema } from "@arcana/shared";

import { apiRequest, ApiError } from "@/lib/api";
import { WardrobeMatrix } from "@/components/WardrobeMatrix";
import type { CharacterOut, VariableDefinitionOut } from "@/lib/types";

export function CharactersSection({
  storyId,
  characters,
  variableDefinitions,
  onChanged,
}: {
  storyId: string;
  characters: CharacterOut[];
  variableDefinitions: VariableDefinitionOut[];
  onChanged: () => void;
}) {
  // ... exact body copied verbatim from the story page's current CharactersSection - every
  // state variable, every handler (onFirstNameChange/onDisplayNameChange/onCreateCharacter/
  // onToggleProtagonist/etc.), the full JSX return block. Do not rewrite anything - this step
  // is a pure move, not a rewrite. The only type change: `characters: StoryDetailOut["characters"]`
  // becomes `characters: CharacterOut[]` (the two are already the same shape - `StoryDetailOut.
  // characters` IS `CharacterOut[]` per lib/types.ts - so this is a type-alias change only, not
  // a behavior change).
}
```
Copy the function's full body (all ~150+ lines including every sub-handler and the JSX) exactly as it exists today — read it fully in Step 1 first so nothing is missed or altered.

- [ ] **Step 3: Update the story page to import it**

In `apps/admin/app/(app)/stories/[id]/page.tsx`:
- Remove the module-scoped `CharactersSection` function definition entirely.
- Add `import { CharactersSection } from "@/components/CharactersSection";` near the other component imports.
- Remove now-unused imports from the story page if `CharactersSection` was the only consumer of them (e.g. `characterCreateSchema` from `@arcana/shared`, `WardrobeMatrix` — check whether anything else on this page still uses them before removing).
- The existing `<CharactersSection storyId={...} characters={...} variableDefinitions={...} onChanged={...} />` call site needs no changes — same props, same shape.

- [ ] **Step 4: Verify the story page still works**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`: open a story's page, confirm character creation/protagonist toggle/wardrobe still work exactly as before (this step is a pure refactor — nothing should look or behave differently on the story page).

- [ ] **Step 5: Add `variableDefinitions` loading to the chapter editor page**

In `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx`'s `load()`:
```ts
const load = async () => {
  try {
    const [chapterData, nodesData, charactersData, variableDefinitionsData] = await Promise.all([
      apiRequest<ChapterOut>(`/admin/chapters/${chapterId}`),
      apiRequest<SceneNodeOut[]>(`/admin/scene-nodes?chapterId=${chapterId}`),
      apiRequest<CharacterOut[]>(`/admin/characters?storyId=${storyId}`),
      apiRequest<VariableDefinitionOut[]>(`/admin/variables?storyId=${storyId}`),
    ]);
    setChapter(chapterData);
    setNodes(nodesData);
    setCharacters(charactersData);
    setVariableDefinitions(variableDefinitionsData);
    setError(null);
  } catch (err) {
    setError(err instanceof ApiError ? err.message : "Не удалось загрузить главу");
  }
};
```
Add `const [variableDefinitions, setVariableDefinitions] = useState<VariableDefinitionOut[]>([]);` next to the other `useState` declarations. `VariableDefinitionOut` is already imported in this file (used by `onRename`'s existing check-then-create logic) — confirm, no new import needed.

- [ ] **Step 6: Add the «Персонажи» tab**

Extend the `view` state's type from `"list" | "graph"` to `"list" | "graph" | "characters"`. Add a third tab button next to "Список"/"Граф":
```tsx
<button
  onClick={() => setView("characters")}
  className={view === "characters" ? "font-semibold underline" : "text-neutral-600"}
>
  Персонажи
</button>
```
And render it:
```tsx
{view === "characters" && (
  <CharactersSection
    storyId={storyId}
    characters={characters}
    variableDefinitions={variableDefinitions}
    onChanged={load}
  />
)}
```
Import `CharactersSection` from `@/components/CharactersSection`.

- [ ] **Step 7: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`: open a chapter, switch to "Персонажи", confirm the full character card + wardrobe UI works there exactly as it does on the story page (create a character, toggle protagonist, add an outfit with a price) — all without leaving the chapter editor. Run `Skill critique` + `Skill polish` (genuinely separate, itemized passes — see Global Constraints), scoped to this new tab.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/components/CharactersSection.tsx apps/admin/app/\(app\)/stories/\[id\]/page.tsx "apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx"
git commit -m "feat(admin): move character management into the chapter editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0127Wv27WYY5D3o1FAgto5jA"
```

---

### Task 3: NodeTypeMenu + click-to-create on the canvas

**Files:**
- Create: `apps/admin/components/NodeTypeMenu.tsx`
- Modify: `apps/admin/components/SceneGraphView.tsx`

**Interfaces:**
- Consumes: `characters: CharacterOut[]` (already passed into `SceneGraphView`), `NODE_TYPE_LABELS`/`SceneNodeOut["type"]` from `apps/admin/lib/scene-nodes.ts`.
- Produces: `NodeTypeMenu` component: `{position: {x: number, y: number}, characters: CharacterOut[], onPick: (choice: NodeTypeChoice) => void, onClose: () => void, onNewCharacter: () => void}`, where `NodeTypeChoice = {kind: "dialogue", characterId: string | null} | {kind: "generic", type: "CHOICE" | "CONDITION" | "EFFECT" | "END"}`. Task 4 (drag-to-empty-space) reuses this exact component and choice type.

- [ ] **Step 1: Build `NodeTypeMenu`**

A small floating panel (absolutely positioned at the given `{x, y}`, `z-20`, matching `QuickAddToolbar`'s existing popover styling: `rounded border border-neutral-300 bg-white p-3 shadow-lg`) listing, in order: "Рассказчик" button, one button per `characters` entry (label = `character.name.ru`), "+ Новый персонаж" (opens the same compact create-character flow `QuickAddToolbar`'s `NewCharacterPopover` already implements — either import and reuse that component directly, or extract its body into a small shared component if reuse proves awkward; prefer direct reuse first), a visual divider, then one button per generic type: "Выбор", "Условие", "Эффект", "Конец" (from `NODE_TYPE_LABELS`, excluding `"DIALOGUE"` since that's covered by the character buttons above). Clicking a character or "Рассказчик" calls `onPick({kind: "dialogue", characterId})`; clicking a generic type calls `onPick({kind: "generic", type})`. Closes on Escape and on an outside click, mirroring the exact pattern already established in `QuickAddToolbar.tsx`'s three existing popovers (`useEffect` + `mousedown` listener on a wrapper ref, `useEffect` + `keydown` listener for Escape).

- [ ] **Step 2: Wire it into `SceneGraphView` for empty-canvas clicks**

`@xyflow/react`'s `<ReactFlow onPaneClick={(event) => ...}>` fires with the browser `MouseEvent` on a click that lands on the pane background (not on a node/edge). Use `reactFlowInstance.screenToFlowPosition({x: event.clientX, y: event.clientY})` (v12 API — confirm the exact method name against the installed `@xyflow/react@^12.11.6` types before writing this; v12 renamed the older v11 `project()` to `screenToFlowPosition()`) to convert the click's screen coordinates into the same coordinate space `canvasX`/`canvasY` are stored in, and open `NodeTypeMenu` at that flow position, storing it in a new `pendingMenuPosition: {x, y} | null` state.

On `onPick`:
```ts
const onPickFromEmptyCanvas = async (choice: NodeTypeChoice, position: {x: number; y: number}) => {
  const payload =
    choice.kind === "dialogue"
      ? { type: "DIALOGUE", chapterId, order: nextOrderForGraph(), canvasX: Math.round(position.x), canvasY: Math.round(position.y),
          data: { speakerCharacterId: choice.characterId, text: { ru: "…" }, staged: [] } }
      : { type: choice.type, chapterId, order: nextOrderForGraph(), canvasX: Math.round(position.x), canvasY: Math.round(position.y),
          data: DEFAULT_DATA_BY_TYPE[choice.type] };
  await apiRequest("/admin/scene-nodes", { method: "POST", body: JSON.stringify(payload) });
  setPendingMenuPosition(null);
  onNodesChanged();
};
```
`DEFAULT_DATA_BY_TYPE` mirrors the existing `defaultDataByType` object already defined in `page.tsx`'s `onCreateNode` (`{CHOICE: {}, CONDITION: {when: []}, EFFECT: {effects: []}, END: {}}`) — either import it from a shared location (move it to `apps/admin/lib/scene-nodes.ts` as an exported constant, updating `page.tsx`'s `onCreateNode` to import it too, removing the duplication) or duplicate the four-entry object; prefer the shared-constant extraction since `lib/scene-nodes.ts` already exists as exactly this kind of shared home. `nextOrderForGraph()` mirrors `page.tsx`'s existing `nextOrder()` logic (`Math.max(-1, ...nodes.map(n => n.order)) + 1`) — `SceneGraphView` receives `nodes` as a prop already, so this can be computed locally the same way.

No connection is created for a click-to-create on empty canvas — this produces an unconnected node, exactly matching the spec ("выбор создаёт **несвязанный** узел в этой точке").

- [ ] **Step 3: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`: open the Граф tab, click empty canvas space, confirm the menu appears at the click point, pick "Рассказчик", confirm a new unconnected DIALOGUE node appears exactly where clicked. Repeat for a generic type (e.g. "Условие"). Run `Skill critique` + `Skill polish`.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/NodeTypeMenu.tsx apps/admin/components/SceneGraphView.tsx apps/admin/lib/scene-nodes.ts "apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx"
git commit -m "feat(admin): click-to-create nodes on the chapter graph canvas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0127Wv27WYY5D3o1FAgto5jA"
```

---

### Task 4: Per-type output handles + drag-to-connect + drag-to-create + edge deletion

**Files:**
- Modify: `apps/admin/components/SceneGraphView.tsx` (the largest change in this plan)
- Create: `apps/admin/components/graph-nodes/DialogueGraphNode.tsx`, `ChoiceGraphNode.tsx`, `ConditionGraphNode.tsx`, `EndGraphNode.tsx` (custom `@xyflow/react` node renderers — one per type that has a distinct handle shape; DIALOGUE/EFFECT can share one renderer since both have exactly one output handle)

**Interfaces:**
- Consumes: `NodeTypeMenu` from Task 3 (reused for the drag-to-empty-space case).
- Produces: a fully interactive graph — this is the task the spec's core promise ("тянешь линию → соединение; тянешь в пустоту → создать+подключить") depends on.

- [ ] **Step 1: Read `@xyflow/react`'s custom-node and multi-handle documentation for v12**

Before writing any custom node component, read the actual type definitions installed at `apps/admin/node_modules/@xyflow/react/dist/esm/types/nodes.d.ts` (or wherever the installed v12.11.6 package puts them) for the exact `NodeProps`/`Handle` prop shapes — v12's custom-node API (`type`, `data`, registering via `nodeTypes` prop on `<ReactFlow>`) may differ in small ways from older tutorials; verify against the installed version rather than assuming.

- [ ] **Step 2: Build one custom node component per handle shape**

Each renders the same label content `SceneGraphView` already builds (via `nodeSummary`/the view-mode-aware label from Task 6 — for now, before Task 6 lands, keep using the existing `nodeSummary`-based label unchanged) plus explicit `<Handle type="source" position={Position.Right} id="..." />` elements:
- `DialogueGraphNode`/shared for EFFECT too: one `<Handle type="source" position={Position.Right} id="next" />`.
- `ConditionGraphNode`: two handles, `id="then"` and `id="else"`, stacked vertically on the right edge (e.g. `top: "30%"` and `top: "70%"` via inline `style`), each with a small "да"/"нет" text label next to it.
- `ChoiceGraphNode`: receives the node's `choiceOptions` (already available via `node.choiceOptions` on the `SceneNodeOut` passed as this custom node's `data`), renders one `<Handle type="source" position={Position.Right} id={option.id} />` per option, vertically distributed, each labeled with that option's `text.ru` (truncated).
- `EndGraphNode`: no source handle at all (it's a terminal node) — still needs the default `<Handle type="target" position={Position.Left} />` so other nodes can connect INTO it.
- Every node type also needs a `<Handle type="target" position={Position.Left} />` (the "incoming" side) so connections can land on it regardless of type.

Register these via the `nodeTypes` prop on `<ReactFlow nodeTypes={{dialogue: DialogueGraphNode, effect: DialogueGraphNode, choice: ChoiceGraphNode, condition: ConditionGraphNode, end: EndGraphNode}}>` (lowercase keys are React Flow's own convention), and set each `flowNodes` entry's `type` field to the lowercase of `node.type` instead of leaving it as the default box — update the existing `flowNodes` `useMemo` in `SceneGraphView.tsx` accordingly, passing the full `SceneNodeOut` as `data` (not just the pre-built label string) so the custom renderers have access to `choiceOptions`/`type` for building their own handles.

- [ ] **Step 3: Wire `onConnect` for drag-to-existing-node**

`<ReactFlow onConnect={onConnect}>` fires with `{source, sourceHandle, target, targetHandle}` when a drag lands on a valid target handle. Implement:
```ts
const onConnect = useCallback(async (connection: Connection) => {
  const sourceNode = sceneNodes.find((n) => n.id === connection.source);
  if (!sourceNode) return;
  if (sourceNode.type === "DIALOGUE" || sourceNode.type === "EFFECT") {
    await apiRequest(`/admin/scene-nodes/${sourceNode.id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { ...sourceNode.data, nextNodeId: connection.target } }),
    });
  } else if (sourceNode.type === "CONDITION") {
    const field = connection.sourceHandle === "then" ? "thenNodeId" : "elseNodeId";
    await apiRequest(`/admin/scene-nodes/${sourceNode.id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { ...sourceNode.data, [field]: connection.target } }),
    });
  } else if (sourceNode.type === "CHOICE") {
    // connection.sourceHandle is the ChoiceOption's own id, per the handle `id` set in Step 2.
    await apiRequest(`/admin/choice-options/${connection.sourceHandle}`, {
      method: "PATCH",
      body: JSON.stringify({ nextNodeId: connection.target }),
    });
  }
  onNodesChanged();
}, [sceneNodes, onNodesChanged]);
```
No client-side validation needed for "wrong number of handles" — the custom node components from Step 2 only ever render the handles a given type actually has, so an impossible connection (e.g. a second output on DIALOGUE) has no handle to drag from in the first place.

- [ ] **Step 4: Drag-to-empty-space creates + connects in one gesture**

`@xyflow/react` v12 exposes `onConnectEnd(event, connectionState)` — when `connectionState.isValid` is `false` and `connectionState.fromHandle` exists but the drag ended over the pane (not a node), this is the "dragged to empty space" case. Confirm the exact `connectionState` shape against the installed types (v12's `onConnectEnd` signature differs from v11 — read the type definitions, don't assume). On this event:
1. Convert the drop position to flow coordinates (same `screenToFlowPosition` as Task 3).
2. Open the SAME `NodeTypeMenu` from Task 3 at that position, but this time remember which node/handle the drag started from (`connectionState.fromNode`, `connectionState.fromHandle`).
3. On `onPick`, run Task 3's node-creation POST, then immediately run the SAME per-type PATCH logic from Step 3's `onConnect` (using the newly-created node's id as `connection.target` and the remembered `fromNode`/`fromHandle` as the source) — i.e., this is `onConnect`'s body with `connection.target` filled in by the just-created node's id instead of an existing node.

Factor the "given a source node + optional source handle + a target node id, patch the right field" logic from Step 3 into one shared function (e.g. `connectNodes(sourceNode, sourceHandleId, targetNodeId)`) so both `onConnect` and this drag-to-empty-space path call the same code, rather than duplicating the four-way type branch.

- [ ] **Step 5: Edge deletion**

`<ReactFlow onEdgeClick={(event, edge) => setSelectedEdgeId(edge.id)}>` — when an edge is selected, render a small floating "×" button near its midpoint (React Flow's `EdgeLabelRenderer` is the standard way to position UI on top of an edge in v12 — read its docs/types before using) that, on click, clears the corresponding field:
- For a DIALOGUE/EFFECT/CONDITION source: `PATCH` the source node's `data` with the relevant field (`nextNodeId`, or `thenNodeId`/`elseNodeId` depending on which edge — the edge's `id` as built by `edgesForNode()` already encodes this via its label/construction, trace `edgesForNode` in the current file to recover which field a given edge id corresponds to) set to `null`.
- For a CHOICE source: `PATCH /admin/choice-options/{optionId}` with `{nextNodeId: null}`.

This does NOT go through React Flow's `deleteKeyCode`/default edge-deletion — it's a deliberate, explicit click-based action per the Global Constraints' "no accidental deletion via keyboard" rule.

- [ ] **Step 6: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca` — this is the spec's central worked example, build it entirely through canvas gestures:
1. Create a DIALOGUE node (character A) via click-to-create.
2. Create a CHOICE node via click-to-create.
3. Drag a connection from the DIALOGUE node's single handle to the CHOICE node — confirm `data.nextNodeId` is set via a direct `GET /admin/scene-nodes` check.
4. On the CHOICE node, ensure it has at least two options (open its editor panel in the sidebar, add two options if needed, matching the spec's "выбор 1 → текст А, выбор 3 → текст Б").
5. Drag from option 1's handle to empty space, create a new DIALOGUE node there via the menu — confirm it's both created AND connected (option 1's `nextNodeId` set) in one gesture.
6. Drag from option 3's (or option 2's, if only two exist) handle to a DIFFERENT empty spot, creating a second, différent DIALOGUE node — confirm this branch is independently wired and does not affect option 1's link.
7. Click the edge between option 1 and its target, click the delete "×", confirm `nextNodeId` clears to `null` via API check, and the edge disappears from the canvas on reload.
Run `Skill critique` + `Skill polish` — this is the single most technically complex UI surface in this whole plan, give it real scrutiny (hit target sizes on the small handle dots, whether the CHOICE node's height correctly grows to fit N handles without overlapping labels, keyboard-accessibility of the new "×" button).

- [ ] **Step 7: Commit**

```bash
git add apps/admin/components/SceneGraphView.tsx apps/admin/components/graph-nodes/
git commit -m "feat(admin): drag-to-connect and drag-to-create branching on the chapter graph

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0127Wv27WYY5D3o1FAgto5jA"
```

---

### Task 5: Quick-add toolbar chains from the selected graph node

**Files:**
- Modify: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx`

**Interfaces:**
- Consumes: `selectedNodeId` (already exists as page-level state, currently only used by the "Список" view's expand/collapse and `SceneGraphView`'s own internal `selectedNodeId` state — this task lifts the graph's selection up to the page level so the toolbar can read it too).
- Produces: `onAddDialogue`/`onRename`/`onChangeOutfit` chain from the selected node when one is set, falling back to today's last-by-order behavior otherwise. No new exported interface — this is a behavior change to existing functions.

- [ ] **Step 1: Lift `SceneGraphView`'s node-selection state to the parent page**

Currently `SceneGraphView` owns `selectedNodeId` internally (its own `useState`) and the page separately owns its own `selectedNodeId` for the "Список" view. Change `SceneGraphView` to accept `selectedNodeId`/`onSelectNode` as props instead of owning the state itself:
```ts
export function SceneGraphView({
  nodes, characters, storyId, chapterId, onNodesChanged, selectedNodeId, onSelectNode,
}: {
  // ...existing props...
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}) {
```
Replace its internal `const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);` with the prop, and every `setSelectedNodeId(...)` call site with `onSelectNode(...)`. In `page.tsx`, pass the SAME `selectedNodeId`/`setSelectedNodeId` the "Список" view already uses:
```tsx
<SceneGraphView
  nodes={nodes} characters={characters} storyId={storyId} chapterId={chapterId}
  onNodesChanged={load} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId}
/>
```
This means selecting a node in either view now shares one selection state, and switching tabs preserves it — a minor UX improvement that falls directly out of the interface unification this task needs anyway.

- [ ] **Step 2: Change the three quick-add handlers' `previousLastNode` computation**

In `onAddDialogue`/`onRename`/`onChangeOutfit`, replace:
```ts
const sortedNodes = nodes.slice().sort((a, b) => a.order - b.order);
const previousLastNode = sortedNodes.length > 0 ? sortedNodes[sortedNodes.length - 1] : null;
```
with:
```ts
const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;
const sortedNodes = nodes.slice().sort((a, b) => a.order - b.order);
const previousLastNode = selectedNode ?? (sortedNodes.length > 0 ? sortedNodes[sortedNodes.length - 1] : null);
```
Do this identically in all three functions (they currently duplicate this exact two-line block — leave the duplication as-is, matching the file's existing style of small independent handlers, per YAGNI; do not take this as license to also refactor the duplication away unless it's trivial to do alongside this change).

- [ ] **Step 3: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`, reproducing the exact branching scenario the user described: build a CHOICE node with two options already leading to two different DIALOGUE nodes (via Task 4's canvas gestures, or manually via the sidebar editor). Click one of the two resulting DIALOGUE nodes on the graph to select it, then click a character button on the quick-add toolbar — confirm the new reply is chained after the SELECTED node (verify via `GET /admin/scene-nodes` that the selected node's `nextNodeId` now points at the new node), not appended to whatever the highest-order node happened to be. Then click elsewhere (deselect, or just don't select anything) and confirm a toolbar click falls back to the old last-by-order behavior. Run `Skill critique` + `Skill polish` scoped to any new UI feedback needed for "which node is currently selected" (this task doesn't need new UI beyond what the graph already shows via node selection styling, but confirm existing selection highlighting is visible enough now that it drives toolbar behavior, not just the sidebar panel).

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx" apps/admin/components/SceneGraphView.tsx
git commit -m "feat(admin): quick-add toolbar chains from the selected graph node

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0127Wv27WYY5D3o1FAgto5jA"
```

---

### Task 6: «История» / «Глубоко» view-mode toggle

**Files:**
- Modify: `apps/admin/components/SceneGraphView.tsx`
- Modify: `apps/admin/lib/scene-nodes.ts` (extend `nodeSummary` or add a new function)

**Interfaces:**
- Consumes: `sceneNodes: SceneNodeOut[]`, `characters: CharacterOut[]` (both already available in `SceneGraphView`).
- Produces: a `viewMode: "story" | "deep"` toggle rendered above the canvas; node labels switch between the existing `nodeSummary()` output ("Глубоко") and a new, simpler label ("История").

- [ ] **Step 1: Add the toggle UI**

Above the `<ReactFlow>` container in `SceneGraphView.tsx`, add:
```tsx
<div className="mb-2 flex gap-2 text-xs">
  <button
    onClick={() => setViewMode("story")}
    className={viewMode === "story" ? "font-semibold underline" : "text-neutral-600"}
  >
    История
  </button>
  <button
    onClick={() => setViewMode("deep")}
    className={viewMode === "deep" ? "font-semibold underline" : "text-neutral-600"}
  >
    Глубоко
  </button>
</div>
```
`const [viewMode, setViewMode] = useState<"story" | "deep">("story");` — session-local state (per spec: "persist в useState, не в БД"), defaults to "История" as the friendlier default for a scenarist who just opened the graph.

- [ ] **Step 2: Compute the "story mode" label**

Add to `apps/admin/lib/scene-nodes.ts`:
```ts
import type { CharacterOut, SceneNodeOut } from "./types";

/** "История" mode's node label: just who's speaking and what they say - no node-type badges,
 * no effect/condition internals. Falls back to `nodeSummary`'s existing text for CHOICE/
 * CONDITION/EFFECT/END nodes, which don't have a "speaker" to simplify around in the first
 * place; only DIALOGUE gets a genuinely different, simpler rendering here. */
export function storyModeLabel(node: SceneNodeOut, characters: CharacterOut[]): string {
  if (node.type !== "DIALOGUE") return nodeSummary(node);
  const data = node.data as { speakerCharacterId?: string | null; text?: { ru?: string } };
  const speaker = data.speakerCharacterId ? characters.find((c) => c.id === data.speakerCharacterId) : null;
  const speakerName = speaker ? speaker.name.ru : "Рассказчик";
  return `${speakerName}: ${data.text?.ru ?? ""}`;
}
```

- [ ] **Step 3: Compute the "current emotion/outfit" hint (best-effort single-path walk)**

Add to the same file:
```ts
/** Best-effort "what does this character currently look like at this point in the story" -
 * walks forward from the chapter's entry node (or, if none is set, the lowest-order node)
 * following each node's own single "next" link, accumulating the last-seen sprite/position for
 * each character encountered in `staged`, until it reaches `targetNodeId` or runs out of links.
 * For a node reachable via more than one path (a CHOICE branch rejoining later), this reports
 * whichever ONE path the walk happens to take (CONDITION always follows `thenNodeId` if present,
 * CHOICE always follows its first option) - a hint for the author's eyes, not a guarantee of
 * what will actually play for every player. Capped at 500 steps to protect against a cycle an
 * author may have accidentally wired on the canvas (this is an authoring-time convenience, not
 * the reading engine, which has its own separate MAX_AUTO_TRAVERSAL_STEPS guard).
 */
export function currentStagedLookAt(
  nodes: SceneNodeOut[],
  entryNodeId: string | null,
  targetNodeId: string,
): Record<string, { sprite: string; position: string }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let currentId: string | null =
    entryNodeId ?? nodes.slice().sort((a, b) => a.order - b.order)[0]?.id ?? null;
  const seen: Record<string, { sprite: string; position: string }> = {};
  let steps = 0;
  while (currentId && steps < 500) {
    steps++;
    const node = byId.get(currentId);
    if (!node) break;
    if (node.type === "DIALOGUE") {
      const staged = (node.data as { staged?: Array<{ characterId: string; sprite: string; position: string }> }).staged ?? [];
      for (const s of staged) seen[s.characterId] = { sprite: s.sprite, position: s.position };
    }
    if (currentId === targetNodeId) break;
    if (node.type === "DIALOGUE" || node.type === "EFFECT") {
      currentId = (node.data as { nextNodeId?: string | null }).nextNodeId ?? null;
    } else if (node.type === "CONDITION") {
      const d = node.data as { thenNodeId?: string | null; elseNodeId?: string | null };
      currentId = d.thenNodeId ?? d.elseNodeId ?? null;
    } else if (node.type === "CHOICE") {
      currentId = node.choiceOptions.slice().sort((a, b) => a.order - b.order)[0]?.nextNodeId ?? null;
    } else {
      currentId = null; // END, or an unrecognized type - nowhere further to walk.
    }
  }
  return seen;
}
```

- [ ] **Step 4: Render the thumbnail hint in story mode**

In `SceneGraphView`'s `flowNodes` `useMemo`, when `viewMode === "story"` and the node is a DIALOGUE with a `speakerCharacterId`, call `currentStagedLookAt(sceneNodes, chapter.entryNodeId, node.id)` (note: `SceneGraphView` needs `chapter.entryNodeId` — check whether `chapter` is already passed as a prop; if not, add `entryNodeId: string | null` as a new prop from the parent page) to get that speaker's current sprite key, and render a small `<img>` thumbnail (use `character.sprites[spriteKey]` if present) alongside the text label in the custom node's JSX (from Task 4's `DialogueGraphNode`). Recomputing this walk once per node on every render is fine for a typical chapter's node count (dozens, not thousands) — don't add memoization for this unless a live check reveals actual jank.

- [ ] **Step 5: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`: toggle between "История"/"Глубоко" on a chapter with a mix of node types, confirm DIALOGUE nodes show speaker+text (+thumbnail if the character has a sprite) in "История" and the full technical summary in "Глубоко"; confirm non-DIALOGUE nodes look the same in both modes (per Step 2's fallback). Build a small scenario where a character's outfit changes mid-chapter (via a "Смена наряда" CHOICE) and confirm a DIALOGUE node after that point shows the updated thumbnail while one before it shows the original. Run `Skill critique` + `Skill polish`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components/SceneGraphView.tsx apps/admin/lib/scene-nodes.ts apps/admin/components/graph-nodes/
git commit -m "feat(admin): История/Глубоко view-mode toggle for the chapter graph

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0127Wv27WYY5D3o1FAgto5jA"
```

---

### Task 7: «Переменные» tab + go-to navigation

**Files:**
- Create: `apps/admin/components/VariableReferencesPanel.tsx`
- Modify: `apps/admin/lib/types.ts` (new `VariableUsageOut`/`VariableUsageEntry` types matching Task 1's backend response)
- Modify: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx` (new "Переменные" tab + `?node=` query-param handling)

**Interfaces:**
- Consumes: `GET /admin/stories/{storyId}/variable-usages` (Task 1).
- Produces: a new tab; a URL query param `node` that, when present on page load, auto-selects and centers that node in whichever view is active (primarily meaningful for the Граф tab, per the spec's `fitView`/`setCenter` requirement).

- [ ] **Step 1: Add the frontend types**

`apps/admin/lib/types.ts`:
```ts
export type VariableUsageEntry = {
  chapterId: string;
  chapterTitle: LocalizedText;
  seasonIndex: number;
  chapterIndex: number;
  nodeId: string;
  nodeType: "DIALOGUE" | "CHOICE" | "CONDITION" | "EFFECT" | "END";
  role: "sets" | "reads";
};

export type VariableUsageOut = {
  definition: VariableDefinitionOut;
  usages: VariableUsageEntry[];
};
```

- [ ] **Step 2: Build `VariableReferencesPanel`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { apiRequest, ApiError } from "@/lib/api";
import type { VariableUsageOut } from "@/lib/types";

export function VariableReferencesPanel({ storyId, currentChapterId }: { storyId: string; currentChapterId: string }) {
  const [usages, setUsages] = useState<VariableUsageOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<VariableUsageOut[]>(`/admin/stories/${storyId}/variable-usages`)
      .then(setUsages)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить переменные"));
  }, [storyId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!usages) return <p className="text-neutral-500">Загрузка…</p>;
  if (usages.length === 0) {
    return <p className="text-sm text-neutral-500">В этой истории пока нет переменных.</p>;
  }

  return (
    <div className="space-y-4">
      {usages.map(({ definition, usages: entries }) => (
        <div key={definition.id} className="rounded border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">{definition.label.ru}</span>
            <span className="text-xs text-neutral-500">{definition.key}</span>
          </div>
          {entries.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">Пока нигде не используется</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-neutral-100">
                {entries.map((entry, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-3 text-neutral-600">
                      С{entry.seasonIndex} · Э{entry.chapterIndex} · {entry.chapterTitle.ru}
                    </td>
                    <td className="py-1 pr-3">
                      <span className={entry.role === "sets" ? "text-blue-700" : "text-purple-700"}>
                        {entry.role === "sets" ? "задаёт" : "проверяет"}
                      </span>{" "}
                      ({entry.nodeType})
                    </td>
                    <td className="py-1 text-right">
                      {entry.chapterId === currentChapterId ? (
                        <button
                          onClick={() => window.dispatchEvent(new CustomEvent("graph-navigate", { detail: entry.nodeId }))}
                          className="text-xs text-neutral-600 underline"
                        >
                          Перейти
                        </button>
                      ) : (
                        <Link
                          href={`/stories/${storyId}/chapters/${entry.chapterId}?view=graph&node=${entry.nodeId}`}
                          className="text-xs text-neutral-600 underline"
                        >
                          Перейти
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
```
The same-chapter case uses a `CustomEvent` rather than a `Link` (a `Link` to the exact same URL wouldn't trigger Next.js navigation/remounting, so a query-param effect wouldn't re-fire) — the parent page listens for `"graph-navigate"` and calls the same node-selection logic Step 4 below wires up for the initial `?node=` case. If this event-based approach feels awkward once implemented, an acceptable alternative is lifting a `navigateToNodeId` callback prop down from the parent page into `VariableReferencesPanel` instead of a global event — prefer that if it's not meaningfully more code, since prop-drilling one callback is more idiomatic React than a global DOM event for same-page communication. Use your judgment during implementation; either satisfies the requirement.

- [ ] **Step 3: Add the tab**

In `page.tsx`, extend `view` to `"list" | "graph" | "characters" | "variables"`, add the tab button, and render:
```tsx
{view === "variables" && (
  <VariableReferencesPanel storyId={storyId} currentChapterId={chapterId} />
)}
```

- [ ] **Step 4: `?node=`/`?view=` query-param handling**

Using `useSearchParams` (Next.js App Router, already used elsewhere in this admin panel — check an existing page for the exact import if unfamiliar) in `page.tsx`:
```ts
const searchParams = useSearchParams();
useEffect(() => {
  const requestedView = searchParams.get("view");
  const requestedNode = searchParams.get("node");
  if (requestedView === "graph") setView("graph");
  if (requestedNode) setSelectedNodeId(requestedNode);
}, [searchParams]);
```
`SceneGraphView` needs to react to an externally-set `selectedNodeId` by centering the canvas on that node — `@xyflow/react`'s `useReactFlow()` hook exposes `setCenter(x, y, options)`; add a `useEffect` inside `SceneGraphView` keyed on `selectedNodeId` that looks up that node's `canvasX`/`canvasY` and calls `setCenter` when it changes from outside (not from a click within the graph itself — a simple way to distinguish is: only auto-center on the FIRST render where `selectedNodeId` is already non-null from a prop, i.e. an effect with `useRef` tracking "have we auto-centered for this specific selectedNodeId value yet").
Also wire the "graph-navigate" `CustomEvent` from Step 2 (if that approach was used): add a `window.addEventListener("graph-navigate", (e) => { setView("graph"); setSelectedNodeId(e.detail); })` in `page.tsx`.

- [ ] **Step 5: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`, reproducing the spec's cross-season example end to end:
1. Create a variable, set it via an EFFECT node in one chapter (season 1), check it via a CONDITION node in a DIFFERENT chapter (season 2) of the same story.
2. Open "Переменные" from either chapter, confirm both usages appear with correct season/chapter labels and correct "задаёт"/"проверяет" roles.
3. Click "Перейти" on the cross-chapter entry — confirm it navigates to the other chapter's page with the Граф tab active and the correct node selected/centered.
4. Click "Перейти" on a same-chapter entry (if the test scenario has one) — confirm it selects/centers without a full page navigation.
Run `Skill critique` + `Skill polish`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components/VariableReferencesPanel.tsx apps/admin/lib/types.ts "apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx" apps/admin/components/SceneGraphView.tsx
git commit -m "feat(admin): Переменные tab with cross-chapter usage go-to navigation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0127Wv27WYY5D3o1FAgto5jA"
```

---

### Task 8: Integration pass — full worked example + verification

**Files:**
- Verify only: everything above.

**Interfaces:**
- Consumes: every task above.
- Produces: a fully green repo and a recorded, real run of the spec's worked examples.

- [ ] **Step 1: Full workspace verification**

```bash
cd /Users/pavelgolubinec/Desktop/MyProjects/Startaps/Arcana-
pnpm install
pnpm --filter @arcana/shared build
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
cd apps/api && source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest
ruff check app seed.py tests
```

- [ ] **Step 2: End-to-end walkthrough via `orca`**

Using "Тестовая стори" (never "Маска и Слово"), build, entirely through canvas gestures + the quick-add toolbar (no manual "next node" dropdown anywhere the graph/toolbar already cover it):
1. Two characters, one marked protagonist (managed from the new "Персонажи" tab, without leaving the chapter editor).
2. A CHOICE node with at least two options leading to genuinely different DIALOGUE nodes (built via click-to-create + drag-to-connect/drag-to-empty-space), confirming each option's own branch is independent (editing/deleting one option's connection doesn't affect the other's).
3. Toggle "История"/"Глубоко" and confirm the difference is visible and correct.
4. A variable set in one chapter, checked in a chapter of a DIFFERENT season of the same story; confirm the "Переменные" tab shows both and "Перейти" correctly navigates.
5. Quick-add a reply from a SELECTED (non-last) node on the graph, confirming it branches from there rather than the last-created node.

- [ ] **Step 3: Report follow-ups**

Note any rough edges surfaced during the walkthrough — especially anything about `@xyflow/react` v12 API specifics that differed from what earlier tasks assumed (this plan flags several spots where the exact v12 method/prop names need verification against the installed package rather than assumption) — so they reach the user rather than being silently absorbed.

- [ ] **Step 4: Fix only if something is actually broken**

Same rule as every other integration task on this project: everything already built and reviewed working is the expected outcome, not a sign something's wrong. Fix only real breaks found by this walkthrough, with the same rigor (reproduce, fix, verify) as any other task — no separate commit if nothing needed fixing.

---

## Self-Review

**Spec coverage:**
- Интерактивный холст (создание кликом, per-type handles, драг-коннект, драг-в-пустоту, удаление связи) → Tasks 3, 4. ✓
- Панель кнопок от выбранного узла → Task 5. ✓
- Вкладка «Персонажи» в редакторе главы → Task 2. ✓
- «История»/«Глубоко» с миниатюрой текущей эмоции/наряда → Task 6. ✓
- Вкладка «Переменные» + переход между главами/сезонами → Tasks 1, 7. ✓
- Явно не входит (движок, новые типы узлов, кросс-историйные зависимости) → ни одна задача не трогает `condition_engine.py`/`SceneNodeType`/другие истории. ✓

**Placeholder scan:** No "TBD"/"handle appropriately" left. The two spots flagged as "confirm against the installed `@xyflow/react` v12 types before writing" (Tasks 3 Step 2, Task 4 Steps 1/4) are not placeholders — they're explicit instructions to verify an external library's exact API surface before using it, which is normal engineering practice for a library API this plan's author has not directly re-verified line-by-line for this exact pinned version; the plan already specifies the intended behavior precisely (method purpose, expected shape), leaving only "confirm the literal method name" to implementation time.

**Type consistency:** `VariableUsageOut`/`VariableUsageEntry` (Task 1 backend, Task 7 frontend) share field names throughout (`chapterId`, `chapterTitle`, `seasonIndex`, `chapterIndex`, `nodeId`, `nodeType`, `role`). `selectedNodeId`/`onSelectNode` (Task 5) match `SceneGraphView`'s prop rename exactly. `NodeTypeChoice` (Task 3) is reused verbatim by Task 4's drag-to-empty-space flow. `currentStagedLookAt`/`storyModeLabel` (Task 6) are both added to the same `lib/scene-nodes.ts` module `nodeSummary` already lives in, keeping node-label logic in one place.

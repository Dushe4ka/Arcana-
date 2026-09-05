# Wardrobe Sprite Matrix (Admin Panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a scriptwriter upload a character's sprites as a matrix (rows = expressions/poses, columns = outfits) instead of the single hardcoded "neutral" sprite slot that exists today, without touching the backend at all — the composite sprite-key resolution (`{outfit}_{pose}` with fallback to a flat key) is already implemented and tested in `apps/api/app/services/preview_service.py` / `play_service.py` (see `apps/api/tests/test_wardrobe_sprite_resolution.py`), and `PATCH /admin/characters/{id}` already accepts an arbitrary `sprites: dict[str, str]`.

**Architecture:** A character's wardrobe has no separate stored schema anywhere — the sprite keys already in `Character.sprites` (JSONB, `Record<string, string>`) ARE the data; a key with no underscore is a bare pose under the implicit "no outfit" base column, a key like `dress_neutral` is `{outfit}_{pose}`. The new `WardrobeMatrix` component derives its rows/columns by parsing existing keys, lets the writer add more of either, and on first use of a second outfit column creates the `outfit` `VariableDefinition` (`type: STRING`, `character_id` = this character) the reading/preview engine already looks up by that exact hardcoded key — this is the "единственный недостающий шаг" the design spec calls out, and it turns out to require zero new backend code, only using two endpoints (`POST /admin/variables`, `PATCH /admin/characters/{id}`) that already exist.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 — same as the rest of `apps/admin`. No new dependencies, no backend changes.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-panel-design.md`, section "Гардероб: переодевания/причёски/макияж персонажей" (lines 141-162). That section explicitly defers "independent wardrobes for hairstyle/makeup" to a later detailed-design pass; this plan implements exactly the one wardrobe dimension (`outfit`) the engine already resolves — approved in chat with the user before this plan was written.

## Global Constraints

- **Backend is completely out of scope.** Do not touch `apps/api` at all. Every endpoint this feature needs already exists: `GET /admin/stories/{id}` (already returns `variableDefinitions` per character, see `apps/api/app/schemas/responses.py:105-110` and the eager-load at `apps/api/app/services/stories_service.py:55` — just not yet typed/used on the frontend), `POST /admin/variables`, `PATCH /admin/characters/{id}` (full-replace on `sprites`), `POST /admin/uploads`.
- **Never reconstruct the `sprites` object from the parsed grid state.** Every single-cell upload or delete must spread the character's CURRENT full `sprites` object and touch exactly one key (`{ ...character.sprites, [key]: url }` to add, or delete `sprites[key]` after copying, to remove) — this is the existing, already-correct pattern in the code this plan replaces (`onSpriteUploaded` in the current `page.tsx`). Reconstructing `sprites` from only the outfits/poses the grid happens to know about at render time would silently drop any sprite key this session's parsing didn't recognize - a real data-loss risk given the parsing is a best-effort heuristic (see next point).
- **Outfit/pose name validation is UI-only, not a backend contract.** New outfit/pose names entered through this component must match `^[a-z][a-z0-9]*$` (lowercase ASCII letters and digits only, no underscore, no uppercase, no spaces) - this is what keeps `${outfit}_${pose}` splittable unambiguously by the FIRST underscore in the key, since neither half can contain one. A pre-existing hand-typed sprite key that doesn't follow this convention may render under a "guessed" row/column, but per the point above this never causes data loss on save, only a possibly-wrong grid position for display.
- Every mutation/network handler needs its own try/catch surfacing `ApiError.message` (or a Russian fallback) into visible UI state — this precedent was violated at least once in each of the three prior admin-panel plans this session, always caught in review.
- Deleting a sprite from a cell must ask `confirm(...)` first, matching the existing destructive-action pattern already used elsewhere in this codebase (`onDeleteNode`, `onDeleteStory`, etc.) - never delete on a bare click.
- Images from uploaded/arbitrary URLs are rendered with a plain `<img>` tag plus `// eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded-file URLs, not a static local asset next/image can optimize` directly above each `<img>` — existing convention, see `apps/admin/components/ImageUpload.tsx:50-51`.
- Text fields are localized (`{ru: string, en?: string}`); admin code reads `.ru` directly with no i18n helper.
- A live-browser CLI, `orca`, is installed on this machine and reachable via Bash from any shell (plain binary at `/usr/local/bin/orca`, no special tool needed). Use it to actually verify interactive behavior. Key commands: `orca tab create --url <url> --json`, `orca snapshot --json` (returns an accessibility-tree snapshot with `ref` ids for every interactive element), `orca click --element <ref> --json`, `orca fill --element <ref> --value <text> --json`, `orca eval --expression <js> --json`, `orca tab close --json`. Run `orca agent-context --json` for the full reference if needed. Known quirk: `orca click --element <ref>` can silently no-op if the target is below the current viewport fold - `scrollIntoView({block:'center'})` via `orca eval` first, then retry, if a click doesn't seem to register. The admin dev server is normally already running at `http://localhost:3000` and the backend at `http://localhost:4000` in this environment - check with `lsof -nP -iTCP:3000 -sTCP:LISTEN` / `:4000` before assuming you need to start them; if neither is running, start the backend with `cd apps/api && source .venv/bin/activate && uvicorn app.main:asgi_app --port 4000` and the admin panel with `cd apps/admin && npx next dev --port 3000`, both in the background. Login: `admin@arcana.app` / `ChangeMe123!`. The seed story "Тестовая стори" has a character named "Арина" already - use it (or create a throwaway character) for verification, and clean up any sprites/variables you create purely for testing afterward so the seed data stays as found.

---

### Task 1: WardrobeMatrix component + types + wiring

**Files:**
- Modify: `apps/admin/lib/types.ts` (add `VariableDefinitionOut`, extend `StoryDetailOut`)
- Create: `apps/admin/components/WardrobeMatrix.tsx`
- Modify: `apps/admin/app/(app)/stories/[id]/page.tsx` (replace the single-sprite upload in `CharactersSection` with the matrix)

**Interfaces:**
- Consumes: `apiRequest`/`ApiError` from `@/lib/api`, `CharacterOut` (already exists in `lib/types.ts`), the endpoints listed in Global Constraints.
- Produces: `WardrobeMatrix({ character, storyId, variableDefinitions, onChanged }: { character: CharacterOut; storyId: string; variableDefinitions: VariableDefinitionOut[]; onChanged: () => void })` - a self-contained component (owns its own network calls, like `SceneGraphView` and `NodeEditorPanel` already do elsewhere in this codebase). Nothing else in the plan depends on this - it's the only task.

- [ ] **Step 1: Add `VariableDefinitionOut` to `apps/admin/lib/types.ts` and extend `StoryDetailOut`**

Append this type to the file (it already imports `LocalizedText` at the top - no new import needed):

```typescript
export type VariableDefinitionOut = {
  id: string;
  storyId: string;
  key: string;
  label: LocalizedText;
  type: "NUMBER" | "BOOLEAN" | "STRING";
  defaultValue: number | boolean | string;
  characterId: string | null;
  minValue: number | null;
  maxValue: number | null;
};
```

Then find the existing declaration:

```typescript
export type StoryDetailOut = StoryOut & {
  seasons: SeasonOut[];
  characters: CharacterOut[];
};
```

and replace it with:

```typescript
export type StoryDetailOut = StoryOut & {
  seasons: SeasonOut[];
  characters: CharacterOut[];
  variableDefinitions: VariableDefinitionOut[];
};
```

(The backend already returns this field on every `GET /admin/stories/{id}` response - see `apps/api/app/schemas/responses.py:105-110` and the eager-load at `apps/api/app/services/stories_service.py:55`. This is purely adding the missing frontend type for data the API was already sending.)

- [ ] **Step 2: Create `apps/admin/components/WardrobeMatrix.tsx`**

```tsx
"use client";

import { useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type { CharacterOut, VariableDefinitionOut } from "@/lib/types";

const SLUG_RE = /^[a-z][a-z0-9]*$/;
/** Sentinel for the "no outfit" column - a bare sprite key (no `_` prefix) lives here. Never
 * itself used as part of a real sprite key. */
const BASE_OUTFIT = "";

/** A character's wardrobe has no separate stored schema anywhere - the sprite keys already in
 * `Character.sprites` ARE the data. Splits each key on its FIRST underscore: no underscore
 * means a bare pose under the base column; one underscore means `${outfit}_${pose}`. Outfit
 * names entered through this component are validated (see SLUG_RE) to never contain an
 * underscore themselves, so this split is unambiguous for anything uploaded through this UI -
 * a legacy hand-typed key with an underscore inside the pose name itself could misparse, but
 * that only affects which cell it's displayed under at render time, never what gets saved:
 * every save always spreads the full existing `sprites` object and touches exactly one key. */
function deriveAxes(sprites: Record<string, string>): { outfits: string[]; poses: string[] } {
  const outfits = new Set<string>();
  const poses = new Set<string>();
  for (const key of Object.keys(sprites)) {
    const underscoreIndex = key.indexOf("_");
    if (underscoreIndex === -1) {
      poses.add(key);
    } else {
      outfits.add(key.slice(0, underscoreIndex));
      poses.add(key.slice(underscoreIndex + 1));
    }
  }
  return { outfits: Array.from(outfits), poses: Array.from(poses) };
}

function spriteKey(outfit: string, pose: string): string {
  return outfit === BASE_OUTFIT ? pose : `${outfit}_${pose}`;
}

export function WardrobeMatrix({
  character,
  storyId,
  variableDefinitions,
  onChanged,
}: {
  character: CharacterOut;
  storyId: string;
  variableDefinitions: VariableDefinitionOut[];
  onChanged: () => void;
}) {
  const derived = deriveAxes(character.sprites);
  const [extraOutfits, setExtraOutfits] = useState<string[]>([]);
  const [extraPoses, setExtraPoses] = useState<string[]>(derived.poses.length === 0 ? ["neutral"] : []);
  const [newOutfitName, setNewOutfitName] = useState("");
  const [newPoseName, setNewPoseName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addingOutfit, setAddingOutfit] = useState(false);

  const outfits = [
    BASE_OUTFIT,
    ...derived.outfits,
    ...extraOutfits.filter((o) => !derived.outfits.includes(o)),
  ];
  const poses = Array.from(new Set([...derived.poses, ...extraPoses]));

  const hasOutfitVariable = variableDefinitions.some(
    (v) => v.key === "outfit" && v.characterId === character.id,
  );

  const validateName = (name: string, existing: string[]): string | null => {
    if (!SLUG_RE.test(name)) {
      return "Только строчные латинские буквы и цифры, без пробелов и подчёркиваний";
    }
    if (existing.includes(name)) return "Уже есть с таким именем";
    return null;
  };

  const onAddOutfit = async () => {
    if (addingOutfit) return;
    const name = newOutfitName.trim();
    const validationError = validateName(name, outfits);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setAddingOutfit(true);
    try {
      // `hasOutfitVariable` reflects the parent's last-known `variableDefinitions` - guarding
      // with `addingOutfit` (rather than relying on that prop alone) prevents firing two
      // creates back-to-back before the post-`onChanged()` refetch lands, which would hit the
      // backend's `(story_id, key, character_id)` unique constraint on the second one.
      if (!hasOutfitVariable) {
        await apiRequest("/admin/variables", {
          method: "POST",
          body: JSON.stringify({
            storyId,
            key: "outfit",
            label: { ru: "Наряд" },
            type: "STRING",
            defaultValue: name,
            characterId: character.id,
          }),
        });
      }
      setExtraOutfits((prev) => [...prev, name]);
      setNewOutfitName("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить наряд");
    } finally {
      setAddingOutfit(false);
    }
  };

  const onAddPose = () => {
    const name = newPoseName.trim();
    const validationError = validateName(name, poses);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setExtraPoses((prev) => [...prev, name]);
    setNewPoseName("");
  };

  const onCellUploaded = async (outfit: string, pose: string, url: string) => {
    const key = spriteKey(outfit, pose);
    const sprites = { ...character.sprites, [key]: url };
    try {
      await apiRequest(`/admin/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sprites }),
      });
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить спрайт");
    }
  };

  const onCellRemoved = async (outfit: string, pose: string) => {
    const key = spriteKey(outfit, pose);
    if (!confirm(`Удалить спрайт "${key}"?`)) return;
    const sprites = { ...character.sprites };
    delete sprites[key];
    try {
      await apiRequest(`/admin/characters/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sprites }),
      });
      setError(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить спрайт");
    }
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-left font-medium">
                Выражение
              </th>
              {outfits.map((outfit) => (
                <th
                  key={outfit || "base"}
                  className="border border-neutral-200 bg-neutral-50 px-2 py-1 font-medium"
                >
                  {outfit === BASE_OUTFIT ? "Без наряда" : outfit}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {poses.map((pose) => (
              <tr key={pose}>
                <td className="border border-neutral-200 px-2 py-1 font-medium">{pose}</td>
                {outfits.map((outfit) => (
                  <td key={outfit || "base"} className="border border-neutral-200 p-1">
                    <WardrobeCell
                      currentUrl={character.sprites[spriteKey(outfit, pose)]}
                      onUploaded={(url) => onCellUploaded(outfit, pose, url)}
                      onRemove={() => onCellRemoved(outfit, pose)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {poses.length === 0 && (
              <tr>
                <td
                  colSpan={outfits.length + 1}
                  className="border border-neutral-200 px-2 py-2 text-neutral-500"
                >
                  Пока нет выражений
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          value={newPoseName}
          onChange={(e) => setNewPoseName(e.target.value)}
          placeholder="имя выражения"
          className="w-32 rounded border border-neutral-300 px-2 py-1"
        />
        <button onClick={onAddPose} className="rounded border border-neutral-300 px-2 py-1">
          + Добавить выражение
        </button>
        <input
          value={newOutfitName}
          onChange={(e) => setNewOutfitName(e.target.value)}
          placeholder="имя наряда"
          className="w-32 rounded border border-neutral-300 px-2 py-1"
        />
        <button
          onClick={onAddOutfit}
          disabled={addingOutfit}
          className="rounded border border-neutral-300 px-2 py-1 disabled:opacity-50"
        >
          + Добавить наряд
        </button>
      </div>

      {outfits.length > 1 && (
        <p className="text-xs text-neutral-500">
          Пустая ячейка — не ошибка: будет использован спрайт из колонки «Без наряда». Чтобы
          наряд переключался у игрока, добавьте в узле выбора/эффекта эффект{" "}
          <code className="rounded bg-neutral-100 px-1">
            outfit = {outfits.find((o) => o !== BASE_OUTFIT) ?? "…"}
          </code>
          .
        </p>
      )}
    </div>
  );
}

function WardrobeCell({
  currentUrl,
  onUploaded,
  onRemove,
}: {
  currentUrl: string | undefined;
  onUploaded: (url: string) => void;
  onRemove: () => void;
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
      const result = await apiRequest<{ url: string }>("/admin/uploads", {
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
    <div className="flex w-20 flex-col items-center gap-1">
      {currentUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded-file URLs, not a static local asset next/image can optimize */}
          <img src={currentUrl} alt="" className="h-12 w-12 rounded border border-neutral-300 object-cover" />
          <button onClick={onRemove} className="text-[10px] text-red-600 underline">
            Удалить
          </button>
        </>
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-neutral-300 text-[10px] text-neutral-400">
          нет
        </div>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onFileChange}
        disabled={uploading}
        className="w-20 text-[10px]"
      />
      {uploading && <p className="text-[10px] text-neutral-500">Загрузка…</p>}
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Wire `WardrobeMatrix` into `apps/admin/app/(app)/stories/[id]/page.tsx`**

Add `WardrobeMatrix` to the imports. Find:

```tsx
import { ImageUpload } from "@/components/ImageUpload";
import type { StoryDetailOut } from "@/lib/types";
```

Replace with:

```tsx
import { ImageUpload } from "@/components/ImageUpload";
import { WardrobeMatrix } from "@/components/WardrobeMatrix";
import type { StoryDetailOut, VariableDefinitionOut } from "@/lib/types";
```

Find the `CharactersSection` call site:

```tsx
      <CharactersSection storyId={story.id} characters={story.characters} onChanged={load} />
```

Replace with:

```tsx
      <CharactersSection
        storyId={story.id}
        characters={story.characters}
        variableDefinitions={story.variableDefinitions}
        onChanged={load}
      />
```

Find the entire `CharactersSection` function:

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
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    try {
      await apiRequest(`/admin/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ sprites }) });
      setUploadError(null);
      onChanged();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Не удалось сохранить спрайт");
    }
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

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

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

Replace with:

```tsx
function CharactersSection({
  storyId,
  characters,
  variableDefinitions,
  onChanged,
}: {
  storyId: string;
  characters: StoryDetailOut["characters"];
  variableDefinitions: VariableDefinitionOut[];
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

      <div className="space-y-4">
        {characters.map((character) => (
          <div key={character.id} className="rounded border border-neutral-200 bg-white p-4">
            <p className="mb-2 font-medium" style={{ color: character.nameColor }}>
              {character.name.ru}
            </p>
            <WardrobeMatrix
              character={character}
              storyId={storyId}
              variableDefinitions={variableDefinitions}
              onChanged={onChanged}
            />
          </div>
        ))}
        {characters.length === 0 && <p className="text-sm text-neutral-500">Пока нет персонажей</p>}
      </div>
    </section>
  );
}
```

Note: `ImageUpload` stays imported and used elsewhere in this same file (the story cover upload at the top of the page) - only its use for character sprites is being replaced.

- [ ] **Step 4: Verify statically**

```bash
cd apps/admin
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all three clean, no errors or new warnings.

- [ ] **Step 5: Verify live with `orca`**

1. Open a story's detail page (the seed story "Тестовая стори" has a character "Арина" already) and confirm the wardrobe matrix renders for that character with at least a "neutral" row under "Без наряда" (if the character has no sprites yet) or its actual existing sprite keys correctly split into rows/columns.
2. Upload an image to the "neutral" / "Без наряда" cell. Confirm it appears as a thumbnail and survives a page reload.
3. Add a new outfit ("dress" or similar slug) via the "+ Добавить наряд" input/button. Confirm: (a) a new column appears, (b) `GET /admin/variables?storyId=<id>` now includes an `outfit` variable definition with `characterId` matching this character (check via `orca eval` calling `fetch` with the stored auth token, or via a direct API call using the admin credentials).
4. Try adding an outfit name that violates the slug pattern (e.g. "Vечерний_наряд" or "My Dress") - confirm it's rejected with the Russian validation message and nothing is sent to the backend.
5. Add a new pose/expression via "+ Добавить выражение" - confirm a new row appears across all outfit columns.
6. Upload an image into one specific (outfit, pose) cell that is NOT the base column - confirm the sprite key saved is `{outfit}_{pose}` (check via a direct `GET /admin/characters?storyId=...` call and inspect the `sprites` object).
7. Delete a sprite from a populated cell - confirm the `confirm()` dialog behavior (accept it, e.g. by patching `window.confirm` to return true via `orca eval` first, matching the pattern used in this session's scene-editor verification) and that the key is actually removed from `sprites` afterward, not just hidden in the UI.
8. Clean up: delete any test sprites/outfit columns/poses and the `outfit` VariableDefinition you created purely for this verification, so "Тестовая стори"'s "Арина" character is left as you found it.

Report the exact snapshot text and API responses you observed at each step in your report file.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/lib/types.ts apps/admin/components/WardrobeMatrix.tsx "apps/admin/app/(app)/stories/[id]/page.tsx"
git commit -m "feat(admin): wardrobe sprite matrix for character costume changes"
```

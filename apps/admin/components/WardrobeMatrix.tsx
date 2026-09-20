"use client";

import { useEffect, useRef, useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import { derivePoses } from "@/lib/sprites";
import type { CharacterOut, OutfitOut, VariableDefinitionOut } from "@/lib/types";
import { EffectRowsEditor, parseValue, type EffectRow } from "./EffectRowsEditor";

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
 * every save always spreads the full existing `sprites` object and touches exactly one key.
 * The pose axis is the same rule `lib/sprites.ts`'s `derivePoses` uses (shared with
 * NodeEditorPanel.tsx and the chapter editor's quick-add) - only the outfit axis is specific to
 * this grid, so it's derived separately here. */
function deriveAxes(sprites: Record<string, string>): { outfits: string[]; poses: string[] } {
  const outfits = new Set<string>();
  for (const key of Object.keys(sprites)) {
    const underscoreIndex = key.indexOf("_");
    if (underscoreIndex !== -1) outfits.add(key.slice(0, underscoreIndex));
  }
  return { outfits: Array.from(outfits), poses: derivePoses(sprites) };
}

function spriteKey(outfit: string, pose: string): string {
  return outfit === BASE_OUTFIT ? pose : `${outfit}_${pose}`;
}

/** Russian noun pluralization has three forms (1 бонус / 2-4 бонуса / 5+ бонусов, with the
 * usual "11-14 always take the many-form" exception) - a naive `n === 1 ? one : many` would
 * mislabel "5 бонуса" instead of "5 бонусов". */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
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
  const [locallyCreatedOutfitVariable, setLocallyCreatedOutfitVariable] = useState(false);
  // Price/stat-effects metadata for outfit columns, keyed by outfit key - a separate `Outfit`
  // row per `(character, key)` pair, fetched independently since `onChanged()` only refreshes
  // the parent's `StoryDetailOut`, which doesn't include outfit rows. `character.sprites` is
  // still the source of truth for *pose* cells, but an outfit's *column* can now also exist
  // purely because it has an `Outfit` row, with no sprite uploaded for it yet (see `outfits`
  // below).
  const [outfitRows, setOutfitRows] = useState<OutfitOut[]>([]);
  // Gates the edit toggle below: until the initial fetch resolves, `outfitRows` being empty is
  // indistinguishable from "this character genuinely has no outfit rows yet", and the toggle's
  // lazy-create-if-missing logic would otherwise risk POSTing a duplicate row for a column that
  // already has one server-side but hasn't loaded into state yet.
  const [outfitsLoaded, setOutfitsLoaded] = useState(false);
  const [editingOutfitKey, setEditingOutfitKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<OutfitOut[]>(`/admin/characters/${character.id}/outfits`)
      .then((rows) => {
        if (!cancelled) setOutfitRows(rows);
      })
      .catch(() => {
        // Outfit pricing is supplementary metadata - a failed fetch shouldn't block the sprite
        // grid itself from rendering, so it's swallowed rather than surfaced via `error`.
      })
      .finally(() => {
        if (!cancelled) setOutfitsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [character.id]);

  // An outfit column can now exist for two independent reasons: a sprite was uploaded under its
  // `${outfit}_${pose}` prefix (`derived.outfits`), or an `Outfit` row was created for it via
  // "+ Добавить наряд" or the price/stat editor's lazy-create, whether or not any sprite has
  // been uploaded yet (`outfitRows`). Without folding `outfitRows` in here, an outfit added
  // purely for its price/bonuses (no art yet) would vanish from the grid on the very next
  // reload - its `Outfit` row would still exist server-side, but nothing would derive a column
  // for it, stranding that priced/bonused outfit with no way to reach its own editor again.
  const persistedOutfitKeys = outfitRows.map((o) => o.key);
  const outfits = [
    BASE_OUTFIT,
    ...derived.outfits,
    ...persistedOutfitKeys.filter((k) => k !== BASE_OUTFIT && !derived.outfits.includes(k)),
    ...extraOutfits.filter((o) => !derived.outfits.includes(o) && !persistedOutfitKeys.includes(o)),
  ];
  const poses = Array.from(new Set([...derived.poses, ...extraPoses]));

  // `variableDefinitions` only reflects the parent's last-known state, which updates
  // asynchronously via `onChanged()`'s refetch - `locallyCreatedOutfitVariable` covers the
  // window between a successful POST and that refetch landing, so a second `onAddOutfit` call
  // in that window sees the variable as already existing instead of firing a duplicate POST
  // that would hit the backend's `(story_id, key, character_id)` unique constraint.
  const hasOutfitVariable =
    locallyCreatedOutfitVariable ||
    variableDefinitions.some((v) => v.key === "outfit" && v.characterId === character.id);

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
        // Set synchronously, before `onChanged()` (fire-and-forget) below - so a rapid second
        // `onAddOutfit` call sees `hasOutfitVariable` as true immediately, without waiting for
        // the parent's async refetch to land.
        setLocallyCreatedOutfitVariable(true);
      }
      // Mirrors `hasOutfitVariable` above: `outfitRows` is this component's own fetched state
      // (not a parent prop), but checking it before POSTing still guards against creating a
      // duplicate `Outfit` row for the same key if this ever runs twice for the same name.
      const hasOutfitRow = outfitRows.some((o) => o.key === name);
      if (!hasOutfitRow) {
        const created = await apiRequest<OutfitOut>(`/admin/characters/${character.id}/outfits`, {
          method: "POST",
          body: JSON.stringify({ key: name, label: { ru: name } }),
        });
        setOutfitRows((prev) => [...prev, created]);
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

  // Every real outfit column should have a backing `Outfit` row so its price/stat-effects
  // editor has something to PATCH - `onAddOutfit` creates one going forward, but a column
  // whose sprite key predates this feature (or a legacy hand-uploaded key) may not have one
  // yet, so the edit toggle lazily creates it on first open rather than failing silently.
  const onToggleOutfitEditor = async (outfit: string) => {
    if (editingOutfitKey === outfit) {
      setEditingOutfitKey(null);
      return;
    }
    if (!outfitsLoaded) return;
    setError(null);
    if (!outfitRows.some((o) => o.key === outfit)) {
      try {
        const created = await apiRequest<OutfitOut>(`/admin/characters/${character.id}/outfits`, {
          method: "POST",
          body: JSON.stringify({ key: outfit, label: { ru: outfit } }),
        });
        setOutfitRows((prev) => [...prev, created]);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Не удалось подготовить наряд для редактирования");
        return;
      }
    }
    setEditingOutfitKey(outfit);
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
                  className="border border-neutral-200 bg-neutral-50 px-2 py-1 align-top font-medium"
                >
                  {outfit === BASE_OUTFIT ? (
                    "Без наряда"
                  ) : (
                    <OutfitColumnHeader
                      outfitKey={outfit}
                      outfitRow={outfitRows.find((o) => o.key === outfit)}
                      outfitsLoaded={outfitsLoaded}
                      isEditing={editingOutfitKey === outfit}
                      onToggle={() => onToggleOutfitEditor(outfit)}
                      onSaved={(updated) =>
                        setOutfitRows((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
                      }
                    />
                  )}
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

/** Column header for one real outfit: its key, a compact price/bonus summary so the state is
 * visible without opening the editor, and the "✎" toggle that opens `OutfitPricingEditor`. */
function OutfitColumnHeader({
  outfitKey,
  outfitRow,
  outfitsLoaded,
  isEditing,
  onToggle,
  onSaved,
}: {
  outfitKey: string;
  outfitRow: OutfitOut | undefined;
  outfitsLoaded: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onSaved: (updated: OutfitOut) => void;
}) {
  const summary = outfitRow
    ? outfitRow.priceHard > 0
      ? `${outfitRow.priceHard} 💎`
      : "Бесплатно"
    : null;
  const bonusCount = outfitRow?.statEffects.length ?? 0;

  return (
    <div className="flex flex-col items-center gap-0.5 font-normal normal-case">
      <span className="font-medium">{outfitKey}</span>
      <button
        type="button"
        onClick={onToggle}
        disabled={!outfitsLoaded}
        className="whitespace-nowrap text-[10px] font-normal text-neutral-500 underline disabled:cursor-wait disabled:opacity-50"
      >
        ✎ Цена и бонусы
      </button>
      {summary && (
        <span className="text-[10px] text-neutral-500">
          {summary}
          {bonusCount > 0 ? ` · +${bonusCount} ${ruPlural(bonusCount, "бонус", "бонуса", "бонусов")}` : ""}
        </span>
      )}
      {isEditing && outfitRow && (
        <OutfitPricingEditor outfit={outfitRow} onSaved={onSaved} onClose={onToggle} />
      )}
    </div>
  );
}

/** Inline price + stat-effects form for one outfit, opened from `OutfitColumnHeader`. Saves via
 * `PATCH /admin/outfits/{id}`; reuses `EffectRowsEditor` for `statEffects` rather than a
 * bespoke rows editor (same component `NodeEditorPanel` uses for choice-option effects). */
function OutfitPricingEditor({
  outfit,
  onSaved,
  onClose,
}: {
  outfit: OutfitOut;
  onSaved: (updated: OutfitOut) => void;
  onClose: () => void;
}) {
  const [labelRu, setLabelRu] = useState(outfit.label.ru || outfit.key);
  // Kept as raw text rather than a parsed number so the field can hold transient states while
  // typing (an emptied field, a bare "-") without snapping back to "0" mid-edit; `priceHard`
  // below derives the actual clamped integer from it, computed fresh on every render and used
  // both for display (the "0 = «Бесплатно»" hint) and for the save payload.
  const [priceInput, setPriceInput] = useState(String(outfit.priceHard));
  const [rows, setRows] = useState<EffectRow[]>(
    outfit.statEffects.map((e) => ({
      variableKey: e.variableKey,
      characterId: e.characterId,
      op: e.op,
      value: String(e.value),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // This popover renders inside a wardrobe-grid `<th>`, growing the header row well past a
  // typical viewport height once expressions/outfits pile up - without this, "Сохранить" can
  // land below the fold immediately on open, with nothing on screen suggesting more scrolling
  // is needed (caught via a live check: an automated click on "+ Добавить эффект" landed
  // exactly where the button *would* be onscreen, but the button itself had already been pushed
  // out of view).
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "nearest" });
    // Re-run whenever a row is added/removed too - each one grows or shrinks the popover, so
    // "nearest" needs to be recomputed against the new height rather than just the initial one.
  }, [rows.length]);

  // `priceHard` is always a non-negative integer number of crystals - round away any
  // fractional/invalid input rather than letting anything else reach the backend (price_hard is
  // a Pydantic `int` with `ge=0`).
  const parsedPrice = Math.round(Number(priceInput));
  const priceHard = Number.isFinite(parsedPrice) ? Math.max(0, parsedPrice) : 0;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest<OutfitOut>(`/admin/outfits/${outfit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: { ru: labelRu.trim() || outfit.key },
          priceHard,
          statEffects: rows.map((r) => ({
            variableKey: r.variableKey,
            characterId: r.characterId,
            op: r.op,
            value: parseValue(r.value),
          })),
        }),
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить наряд");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="mt-1 w-56 space-y-2 rounded border border-neutral-300 bg-white p-2 text-left normal-case shadow-md"
      // Keeps clicks/typing inside the popover from bubbling to anything the header row might
      // have (there isn't one today, but this popover lives inside a <th> of a sortable-looking
      // table and should stay inert to ancestor click handlers regardless).
      onClick={(e) => e.stopPropagation()}
    >
      <label className="block text-[10px] text-neutral-600">
        Название для игрока
        <input
          value={labelRu}
          onChange={(e) => setLabelRu(e.target.value)}
          placeholder={outfit.key}
          className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
        />
      </label>
      <label className="block text-[10px] text-neutral-600">
        Цена в кристаллах
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
        />
      </label>
      {priceHard === 0 && <p className="text-[10px] text-neutral-500">0 = «Бесплатно»</p>}
      <div>
        <p className="mb-1 text-[10px] text-neutral-600">Бонусы при выборе наряда</p>
        <EffectRowsEditor rows={rows} onChange={setRows} />
      </div>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-neutral-900 px-2 py-1 text-[10px] text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        <button type="button" onClick={onClose} className="text-[10px] text-neutral-600 underline">
          Отмена
        </button>
      </div>
    </div>
  );
}

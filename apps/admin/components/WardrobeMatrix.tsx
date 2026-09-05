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

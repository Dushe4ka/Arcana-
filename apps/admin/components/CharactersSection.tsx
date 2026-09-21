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
  const [showCreate, setShowCreate] = useState(false);
  const [firstNameRu, setFirstNameRu] = useState("");
  const [lastNameRu, setLastNameRu] = useState("");
  const [displayNameRu, setDisplayNameRu] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingProtagonistId, setPendingProtagonistId] = useState<string | null>(null);

  const onFirstNameChange = (value: string) => {
    setFirstNameRu(value);
    if (!displayNameTouched) {
      setDisplayNameRu(value);
    }
  };

  const onDisplayNameChange = (value: string) => {
    setDisplayNameTouched(true);
    setDisplayNameRu(value);
  };

  const onCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedFirstName = firstNameRu.trim();
    const trimmedLastName = lastNameRu.trim();
    const trimmedDisplayName = displayNameRu.trim();
    const parsed = characterCreateSchema.safeParse({
      storyId,
      name: { ru: trimmedDisplayName },
      firstName: trimmedFirstName || undefined,
      lastName: trimmedLastName || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте данные");
      return;
    }
    try {
      await apiRequest("/admin/characters", { method: "POST", body: JSON.stringify(parsed.data) });
      setShowCreate(false);
      setFirstNameRu("");
      setLastNameRu("");
      setDisplayNameRu("");
      setDisplayNameTouched(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать персонажа");
    }
  };

  const onToggleProtagonist = async (characterId: string, isProtagonist: boolean) => {
    setPendingProtagonistId(characterId);
    try {
      await apiRequest(`/admin/characters/${characterId}`, {
        method: "PATCH",
        body: JSON.stringify({ isProtagonist }),
      });
      setActionError(null);
      onChanged();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Не удалось изменить статус главной героини");
    } finally {
      setPendingProtagonistId(null);
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
        <form onSubmit={onCreateCharacter} className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 bg-white p-4">
          <div className="flex-1 basis-48">
            <label className="block text-sm text-neutral-600">Имя</label>
            <input
              value={firstNameRu}
              onChange={(e) => onFirstNameChange(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Внутреннее имя для админки — списки, поиск. Игрок его не видит.
            </p>
          </div>
          <div className="flex-1 basis-48">
            <label className="block text-sm text-neutral-600">Фамилия (необязательно)</label>
            <input
              value={lastNameRu}
              onChange={(e) => setLastNameRu(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-neutral-500">Только для админки, игрокам не показывается</p>
          </div>
          <div className="flex-1 basis-48">
            <label className="block text-sm text-neutral-600">Отображаемое имя</label>
            <input
              value={displayNameRu}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-neutral-500">
              То, что видит игрок. По умолчанию совпадает с «Имя», но можно задать по-другому.
            </p>
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">
            Создать
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <div className="space-y-4">
        {characters.map((character) => (
          <div
            key={character.id}
            className={`rounded border bg-white p-4 ${
              character.isProtagonist ? "border-amber-400" : "border-neutral-200"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <p className="font-medium" style={{ color: character.nameColor }}>
                {character.name.ru}
              </p>
              {character.isProtagonist && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Главная героиня
                </span>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-neutral-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <input
                type="checkbox"
                checked={character.isProtagonist}
                disabled={pendingProtagonistId === character.id}
                onChange={(e) => onToggleProtagonist(character.id, e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              Главная героиня
            </label>
            <p className="mb-3 text-xs text-neutral-500">
              Не больше одной на историю — включение здесь снимет её у другого персонажа.
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

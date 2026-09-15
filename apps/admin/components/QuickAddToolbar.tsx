"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type { CharacterOut } from "@/lib/types";

/**
 * Sticky one-click toolbar for building a chapter's dialogue chain without hunting for the
 * "next node" dropdown after every line - one button per character (+ "Рассказчик" + "+ Новый
 * персонаж"). The chaining/creation logic lives in the parent page (`onAddDialogue`); this
 * component only renders the button row and the compact inline character-creation popover.
 *
 * The sticky offset is measured from the app shell's own nav (`apps/(app)/layout.tsx`, which
 * renders `<nav className="sticky top-0 z-10 ...">`) rather than hardcoded, so this toolbar
 * keeps stacking correctly under it even if the nav's height ever changes.
 */
export function QuickAddToolbar({
  storyId,
  characters,
  onAddDialogue,
  onNewCharacter,
}: {
  storyId: string;
  characters: CharacterOut[];
  onAddDialogue: (characterId: string | null) => void;
  onNewCharacter: () => void;
}) {
  const [navHeight, setNavHeight] = useState(0);

  // Runs before paint (not after, like useEffect) so the toolbar never flashes at top:0 for a
  // frame before the real nav height is known.
  useLayoutEffect(() => {
    const navEl = document.querySelector("nav");
    if (!navEl) return;
    const update = () => setNavHeight(navEl.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(navEl);
    return () => observer.disconnect();
  }, []);

  const [showCreateCharacter, setShowCreateCharacter] = useState(false);

  return (
    <div
      className="sticky z-[5] border-b border-neutral-200 bg-white/95 py-3 backdrop-blur"
      style={{ top: navHeight }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-neutral-500">Быстро добавить реплику:</span>
        <button
          type="button"
          onClick={() => onAddDialogue(null)}
          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Рассказчик
        </button>
        {characters.map((character) => (
          <button
            key={character.id}
            type="button"
            onClick={() => onAddDialogue(character.id)}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            {character.name.ru}
          </button>
        ))}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowCreateCharacter((v) => !v)}
            className="rounded-full border border-dashed border-neutral-400 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            {showCreateCharacter ? "Отмена" : "+ Новый персонаж"}
          </button>
          {showCreateCharacter && (
            <NewCharacterPopover
              storyId={storyId}
              onClose={() => setShowCreateCharacter(false)}
              onCreated={onNewCharacter}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact character-creation form anchored under the "+ Новый персонаж" button - just "Имя"
 * (required) and "Фамилия" (optional), unlike Task 5's full character card. The display name
 * (`name.ru`, what the player sees) is set equal to "Имя" directly rather than offering a
 * separate "Отображаемое имя" field: a scenarist reaching for this popover mid-chapter is
 * adding a minor/incidental character to keep building dialogue, not doing a deliberate
 * "villain reveal" name split - that case can still be done via the full form on the story page.
 */
function NewCharacterPopover({
  storyId,
  onClose,
  onCreated,
}: {
  storyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedFirstName = firstName.trim();
    if (!trimmedFirstName) {
      setError("Укажите имя");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/admin/characters", {
        method: "POST",
        body: JSON.stringify({
          storyId,
          name: { ru: trimmedFirstName },
          firstName: trimmedFirstName,
          lastName: lastName.trim() || undefined,
        }),
      });
      setError(null);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать персонажа");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="absolute left-0 top-full z-20 mt-2 w-64 space-y-2 rounded border border-neutral-300 bg-white p-3 text-left shadow-lg"
    >
      <div>
        <label className="block text-xs text-neutral-600">Имя</label>
        <input
          ref={inputRef}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-600">Фамилия (необязательно)</label>
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          Создать
        </button>
        <button type="button" onClick={onClose} className="text-xs text-neutral-600 underline">
          Отмена
        </button>
      </div>
    </form>
  );
}

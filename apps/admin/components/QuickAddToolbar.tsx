"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type { CharacterOut, OutfitOut } from "@/lib/types";

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
  onRename,
  onChangeOutfit,
  lastSpeakerCharacterId = null,
  disabled = false,
}: {
  storyId: string;
  characters: CharacterOut[];
  onAddDialogue: (characterId: string | null) => void;
  onNewCharacter: () => void;
  /** Auto-chains an EFFECT node that sets `display_name_override` for the picked character -
   * see `onRename` in the parent page. Rejects (without closing the popover) if the hard part
   * (variable check/create + node creation) failed, or if another quick action is still in
   * flight (shared `isQuickActionPending` guard) - the popover's `onSubmit` awaits this and
   * must not treat a blocked call as success. A soft chain-link failure resolves normally,
   * same as `onAddDialogue`. */
  onRename: (characterId: string, newName: string) => Promise<void>;
  /** Auto-chains a CHOICE node with one option per outfit the picked character already has -
   * see `onChangeOutfit` in the parent page. Same reject/resolve contract as `onRename`,
   * including the in-flight-guard rejection. */
  onChangeOutfit: (characterId: string) => Promise<void>;
  /** Whoever last spoke in this chapter, if determinable - defaults the "Переименовать"
   * popover's character select to them, since a rename is most often "the character who's been
   * talking this whole time turns out to be someone else." */
  lastSpeakerCharacterId?: string | null;
  /** True while a previous quick-add is still in flight - disables every button in the row (and
   * the "+ Новый персонаж" toggle) so a rapid second click can't race the first's create+patch
   * round-trip. See `onAddDialogue` in the parent page for the race this guards against. */
  disabled?: boolean;
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
  const createCharacterWrapperRef = useRef<HTMLDivElement>(null);

  // Polish pass: close the popover on an outside click. Listens on the wrapper that contains
  // BOTH the "+ Новый персонаж" toggle button and the popover itself (not just the popover) -
  // otherwise a click on the toggle button to close it would fire this handler's `mousedown`
  // first (closing it), then the toggle's own `onClick` would fire on the following `click`
  // event and immediately flip it back open.
  useEffect(() => {
    if (!showCreateCharacter) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        createCharacterWrapperRef.current &&
        !createCharacterWrapperRef.current.contains(e.target as Node)
      ) {
        setShowCreateCharacter(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showCreateCharacter]);

  const [showRename, setShowRename] = useState(false);
  const renameWrapperRef = useRef<HTMLDivElement>(null);

  // Same outside-click-close pattern as the "+ Новый персонаж" wrapper above.
  useEffect(() => {
    if (!showRename) return;
    const onPointerDown = (e: MouseEvent) => {
      if (renameWrapperRef.current && !renameWrapperRef.current.contains(e.target as Node)) {
        setShowRename(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showRename]);

  const [showChangeOutfit, setShowChangeOutfit] = useState(false);
  const changeOutfitWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showChangeOutfit) return;
    const onPointerDown = (e: MouseEvent) => {
      if (changeOutfitWrapperRef.current && !changeOutfitWrapperRef.current.contains(e.target as Node)) {
        setShowChangeOutfit(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showChangeOutfit]);

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
          disabled={disabled}
          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        >
          Рассказчик
        </button>
        {characters.map((character) => (
          <button
            key={character.id}
            type="button"
            onClick={() => onAddDialogue(character.id)}
            disabled={disabled}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            {character.name.ru}
          </button>
        ))}
        <div className="relative" ref={createCharacterWrapperRef}>
          <button
            type="button"
            onClick={() => setShowCreateCharacter((v) => !v)}
            disabled={disabled}
            className="rounded-full border border-dashed border-neutral-400 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
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

        <span className="mx-1 h-5 w-px bg-neutral-200" aria-hidden />

        <div className="relative" ref={renameWrapperRef}>
          <button
            type="button"
            onClick={() => setShowRename((v) => !v)}
            disabled={disabled || characters.length === 0}
            className="rounded-full border border-dashed border-neutral-400 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            {showRename ? "Отмена" : "Переименовать"}
          </button>
          {showRename && (
            <RenamePopover
              characters={characters}
              defaultCharacterId={lastSpeakerCharacterId}
              onClose={() => setShowRename(false)}
              onRename={onRename}
            />
          )}
        </div>

        <div className="relative" ref={changeOutfitWrapperRef}>
          <button
            type="button"
            onClick={() => setShowChangeOutfit((v) => !v)}
            disabled={disabled || characters.length === 0}
            className="rounded-full border border-dashed border-neutral-400 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            {showChangeOutfit ? "Отмена" : "Смена наряда"}
          </button>
          {showChangeOutfit && (
            <ChangeOutfitPopover
              characters={characters}
              onClose={() => setShowChangeOutfit(false)}
              onChangeOutfit={onChangeOutfit}
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
 *
 * Exported (not module-private, unlike `RenamePopover`/`ChangeOutfitPopover` below) so
 * `NodeTypeMenu.tsx`'s own "+ Новый персонаж" entry can reuse it directly instead of
 * duplicating this form - the same compact create-character flow, just anchored under a
 * different trigger.
 */
export function NewCharacterPopover({
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

  // Polish pass: close on Escape, matching the behavior scenarists expect from any transient
  // popover/menu. (Outside-click handling lives on the wrapper in QuickAddToolbar, since it
  // needs to see the toggle button too - see the comment there.)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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

/**
 * Compact form anchored under "Переименовать" - a character select (defaulting to whoever last
 * spoke, when known) and a new-name text input. The actual check-then-create
 * `display_name_override` `VariableDefinition` + auto-chained EFFECT node all happen in the
 * parent page's `onRename` - this component only collects the two inputs and reports the
 * outcome (`saving`/`error`) of that call.
 */
function RenamePopover({
  characters,
  defaultCharacterId,
  onClose,
  onRename,
}: {
  characters: CharacterOut[];
  defaultCharacterId: string | null;
  onClose: () => void;
  onRename: (characterId: string, newName: string) => Promise<void>;
}) {
  const [characterId, setCharacterId] = useState(
    () =>
      characters.find((c) => c.id === defaultCharacterId)?.id ??
      characters[0]?.id ??
      "",
  );
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!characterId) {
      setError("Выберите персонажа");
      return;
    }
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Укажите новое имя");
      return;
    }
    setSaving(true);
    try {
      await onRename(characterId, trimmedName);
      setError(null);
      onClose();
    } catch (err) {
      // `onRename` already recorded the same message in the page's `mutationError` banner - this
      // inline copy keeps the popover itself open with an explanation, instead of it silently
      // closing on a failed submit.
      setError(err instanceof ApiError ? err.message : "Не удалось переименовать персонажа");
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
        <label className="block text-xs text-neutral-600">Персонаж</label>
        <select
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          {characters.length === 0 && <option value="">Нет персонажей</option>}
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name.ru}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-600">Новое отображаемое имя</label>
        <input
          ref={inputRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <p className="text-[10px] text-neutral-500">
        Добавит узел эффекта в конец текущей цепочки — имя сменится с этого места и дальше.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Переименовать"}
        </button>
        <button type="button" onClick={onClose} className="text-xs text-neutral-600 underline">
          Отмена
        </button>
      </div>
    </form>
  );
}

/**
 * Compact form anchored under "Смена наряда" - a character select limited to characters that
 * already have at least one `Outfit` row (Task 2/6's wardrobe pricing UI). Fetches every
 * character's outfit count once, when the popover opens, purely to decide which options in the
 * select are pickable; the parent page's `onChangeOutfit` re-fetches the chosen character's
 * outfits fresh right before building the CHOICE node, so this component's own fetch never has
 * to be perfectly fresh by submit time.
 */
function ChangeOutfitPopover({
  characters,
  onClose,
  onChangeOutfit,
}: {
  characters: CharacterOut[];
  onClose: () => void;
  onChangeOutfit: (characterId: string) => Promise<void>;
}) {
  // null = still loading. A fetch that fails for one character counts as "0 outfits" for it
  // rather than blocking the whole popover - outfit pricing is supplementary metadata elsewhere
  // in this codebase too (see WardrobeMatrix's own outfit fetch).
  const [outfitCounts, setOutfitCounts] = useState<Record<string, number> | null>(null);
  const [characterId, setCharacterId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      characters.map((character) =>
        apiRequest<OutfitOut[]>(`/admin/characters/${character.id}/outfits`)
          .then((rows) => [character.id, rows.length] as const)
          .catch(() => [character.id, 0] as const),
      ),
    ).then((entries) => {
      if (cancelled) return;
      const counts = Object.fromEntries(entries);
      setOutfitCounts(counts);
      const firstEligible = characters.find((c) => (counts[c.id] ?? 0) > 0);
      setCharacterId(firstEligible?.id ?? "");
    });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the popover's mount, not on `characters` changing - it's only open
    // for the length of one quick action, and re-fetching mid-fill because a background reload
    // changed the character list would reset the scenarist's in-progress selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const loaded = outfitCounts !== null;
  const selectedHasNoOutfits = characterId !== "" && (outfitCounts?.[characterId] ?? 0) === 0;
  const noEligibleCharacters = loaded && characters.every((c) => (outfitCounts?.[c.id] ?? 0) === 0);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!characterId || selectedHasNoOutfits) {
      setError("Выберите персонажа с нарядами");
      return;
    }
    setSaving(true);
    try {
      await onChangeOutfit(characterId);
      setError(null);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать узел смены наряда");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="absolute left-0 top-full z-20 mt-2 w-72 space-y-2 rounded border border-neutral-300 bg-white p-3 text-left shadow-lg"
    >
      <div>
        <label className="block text-xs text-neutral-600">Персонаж</label>
        <select
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          disabled={!loaded}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
        >
          <option value="" disabled>
            {loaded ? "Выберите персонажа" : "Загрузка…"}
          </option>
          {characters.map((character) => (
            <option
              key={character.id}
              value={character.id}
              disabled={(outfitCounts?.[character.id] ?? 0) === 0}
            >
              {character.name.ru}
              {loaded && (outfitCounts?.[character.id] ?? 0) === 0 ? " (нет нарядов)" : ""}
            </option>
          ))}
        </select>
      </div>
      {loaded && (selectedHasNoOutfits || noEligibleCharacters) && (
        <p className="text-xs text-amber-700">
          у этого персонажа пока нет нарядов — добавьте в «Гардеробе»
        </p>
      )}
      {loaded && !selectedHasNoOutfits && !noEligibleCharacters && (
        <p className="text-[10px] text-neutral-500">
          Добавит узел выбора в конец текущей цепочки — по одному варианту на каждый наряд.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !loaded || !characterId || selectedHasNoOutfits}
          className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {saving ? "Создание…" : "Добавить"}
        </button>
        <button type="button" onClick={onClose} className="text-xs text-neutral-600 underline">
          Отмена
        </button>
      </div>
    </form>
  );
}

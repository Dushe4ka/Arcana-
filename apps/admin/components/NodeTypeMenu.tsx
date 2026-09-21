"use client";

import { useEffect, useRef, useState } from "react";

import { NODE_TYPE_LABELS } from "@/lib/scene-nodes";
import type { CharacterOut, SceneNodeOut } from "@/lib/types";
import { NewCharacterPopover } from "./QuickAddToolbar";

/** Everything a click on the graph canvas (Task 3) or a drag-to-empty-space (Task 4) can
 * resolve to - either a DIALOGUE node for a specific speaker (`characterId: null` means the
 * narrator, matching `QuickAddToolbar`'s "Рассказчик" convention), or one of the four
 * non-dialogue node types. Callers turn this into the actual `POST /admin/scene-nodes`
 * payload (see `SceneGraphView`'s `onPickFromEmptyCanvas`). */
export type NodeTypeChoice =
  | { kind: "dialogue"; characterId: string | null }
  | { kind: "generic"; type: Exclude<SceneNodeOut["type"], "DIALOGUE"> };

const GENERIC_TYPES: Exclude<SceneNodeOut["type"], "DIALOGUE">[] = ["CHOICE", "CONDITION", "EFFECT", "END"];

/**
 * Floating character/node-type picker popup, opened at a point on the chapter graph canvas
 * (empty-canvas click today, drag-to-empty-space in Task 4). Lists "Рассказчик", one button per
 * story character, "+ Новый персонаж" (reusing `QuickAddToolbar`'s `NewCharacterPopover`
 * verbatim), a divider, then the four non-dialogue node types.
 *
 * Closes on Escape and on an outside click, mirroring the exact pattern `QuickAddToolbar`'s three
 * popovers already use (`useEffect` + `mousedown` on a wrapper ref, `useEffect` + `keydown` for
 * Escape) - deliberately only at this component's own root, not re-implemented per-item, so
 * Escape while the nested "+ Новый персонаж" form is open closes the whole menu (acceptable:
 * Escape reads as "dismiss this transient overlay" either way, and re-scoping the outside-click
 * check to just that nested form would reintroduce the exact toggle-button double-fire bug the
 * comment on `QuickAddToolbar`'s own wrapper warns about, for no behavioral gain here - clicking
 * any other menu item already closes the whole menu via `onPick` regardless).
 *
 * `position` is in flow-space (the same coordinate system `SceneNodeOut.canvasX`/`canvasY` and
 * React Flow node positions use), not screen pixels - callers are expected to render this inside
 * a `<ViewportPortal>` (see `SceneGraphView`) so it pans/zooms together with the canvas instead of
 * needing its own screen-to-flow reconciliation.
 */
export function NodeTypeMenu({
  position,
  storyId,
  characters,
  disabled = false,
  error = null,
  onPick,
  onClose,
  onNewCharacter,
}: {
  position: { x: number; y: number };
  storyId: string;
  characters: CharacterOut[];
  /** True while a picked choice's node-creation request is in flight - disables every button
   * below (including "+ Новый персонаж") so a second click can't fire a second create request
   * before the first resolves. Same role `QuickAddToolbar`'s own `disabled` prop plays for its
   * button row. */
  disabled?: boolean;
  /** Set by the caller when the last pick's creation request failed - shown inline instead of
   * the menu silently closing or doing nothing, so a scenarist isn't left guessing why nothing
   * happened. The menu stays open on error (the caller doesn't call `onClose`) so this message
   * has somewhere to render and the same click can be retried. */
  error?: string | null;
  onPick: (choice: NodeTypeChoice) => void;
  onClose: () => void;
  onNewCharacter: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showCreateCharacter, setShowCreateCharacter] = useState(false);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={wrapperRef}
      // `pointer-events-auto` is required here: `@xyflow/react`'s own stylesheet sets
      // `.react-flow__viewport { pointer-events: none }` (nodes/edges opt back in
      // individually), and this component's caller renders it inside a `<ViewportPortal>`,
      // which sits inside that same viewport element. Without this override every button
      // below is inert to a real mouse click - the click hit-tests straight through to the
      // canvas pane underneath instead of this menu (confirmed live via a Task 8 walkthrough).
      className="pointer-events-auto absolute z-20 w-56 rounded border border-neutral-300 bg-white p-3 shadow-lg"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <p className="mb-2 text-xs font-medium text-neutral-500">Новый узел</p>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPick({ kind: "dialogue", characterId: null })}
          className="rounded px-2 py-1 text-left text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        >
          Рассказчик
        </button>
        {characters.map((character) => (
          <button
            key={character.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick({ kind: "dialogue", characterId: character.id })}
            className="rounded px-2 py-1 text-left text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            {character.name.ru}
          </button>
        ))}
        <div className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowCreateCharacter((v) => !v)}
            className="w-full rounded border border-dashed border-neutral-400 px-2 py-1 text-left text-sm text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
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

        <div className="my-1 h-px bg-neutral-200" aria-hidden />

        {GENERIC_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onClick={() => onPick({ kind: "generic", type })}
            className="rounded px-2 py-1 text-left text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
          >
            {NODE_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

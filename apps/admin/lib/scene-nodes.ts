import type { CharacterOut, SceneNodeOut } from "./types";

export const NODE_TYPE_LABELS: Record<SceneNodeOut["type"], string> = {
  DIALOGUE: "Диалог",
  CHOICE: "Выбор",
  CONDITION: "Условие",
  EFFECT: "Эффект",
  END: "Конец",
};

/** Default `data` payload for a freshly-created node of each type - shared between the "+ <тип>"
 * toolbar (`onCreateNode` in the chapter editor page) and click-to-create on the graph canvas
 * (`SceneGraphView`'s `NodeTypeMenu` wiring), so the two node-creation paths can't drift apart on
 * what an empty node of a given type looks like. `DIALOGUE` isn't included here - both callers
 * build its `data` themselves (`speakerCharacterId`/`staged` depend on which character, if any,
 * was picked). */
export const DEFAULT_DATA_BY_TYPE: Record<Exclude<SceneNodeOut["type"], "DIALOGUE">, object> = {
  CHOICE: {},
  CONDITION: { when: [] },
  EFFECT: { effects: [] },
  END: {},
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

/** "История" mode's node label: just who's speaking and what they say - no node-type badges,
 * no effect/condition internals. Falls back to `nodeSummary`'s existing text for CHOICE/
 * CONDITION/EFFECT/END nodes, which don't have a "speaker" to simplify around in the first
 * place; only DIALOGUE gets a genuinely different, simpler rendering here. */
export function storyModeLabel(node: SceneNodeOut, characters: CharacterOut[]): string {
  if (node.type !== "DIALOGUE") return nodeSummary(node);
  const data = node.data as { speakerCharacterId?: string | null; text?: { ru?: string } };
  const speaker = data.speakerCharacterId
    ? characters.find((c) => c.id === data.speakerCharacterId)
    : null;
  const speakerName = speaker ? speaker.name.ru : "Рассказчик";
  return `${speakerName}: ${data.text?.ru ?? ""}`;
}

/** A character's last-known sprite/position/outfit as of some point in a `currentStagedLookAt`
 * walk. `outfit` is left `undefined` until the walk crosses an EFFECT (or CHOICE first-option)
 * that sets that character's `outfit` variable - see `currentStagedLookAt`'s own comment. */
export type StagedLookAt = { sprite: string; position: string; outfit?: string };

type EffectLike = { variableKey: string; characterId?: string | null; value: unknown };

/** Best-effort "what does this character currently look like at this point in the story" -
 * walks forward from the chapter's entry node (or, if none is set, the lowest-order node)
 * following each node's own single "next" link, accumulating the last-seen sprite/position (and
 * `outfit` variable value - see below) for each character encountered, until it reaches
 * `targetNodeId` or runs out of links. For a node reachable via more than one path (a CHOICE
 * branch rejoining later), this reports whichever ONE path the walk happens to take (CONDITION
 * always follows `thenNodeId` if present, CHOICE always follows its first option) - a hint for
 * the author's eyes, not a guarantee of what will actually play for every player. Capped at 500
 * steps to protect against a cycle an author may have accidentally wired on the canvas (this is
 * an authoring-time convenience, not the reading engine, which has its own separate
 * MAX_AUTO_TRAVERSAL_STEPS guard).
 *
 * Also tracks the last-seen `outfit` variable value per character, from EFFECT node `effects`
 * arrays and the first CHOICE option's `effects` array (same "one path, first option" rule the
 * rest of the walk already follows) - `resolveStagedSpriteUrl` below composes this together with
 * the tracked sprite/pose exactly the way `play_service.py`'s `_resolve_staged_characters` does
 * at play time, so a character with any outfits (whose sprite keys are always
 * `${outfit}_${pose}`, never a bare pose) actually resolves a thumbnail here. A character whose
 * outfit is never set by an EFFECT anywhere on the walked path has no tracked `outfit` at all
 * (this doesn't look up a `VariableDefinition`'s own default value) - matching the pre-existing
 * pose-only behavior for that edge case.
 *
 * Returns an empty object - not whatever was accumulated so far - if the walk never actually
 * reaches `targetNodeId` (it hits a dead end, or the cap, first): a node reachable ONLY via a
 * CHOICE's second/third option, or a freshly created/unconnected node, must never be shown with
 * an unrelated branch's leftover state.
 */
export function currentStagedLookAt(
  nodes: SceneNodeOut[],
  entryNodeId: string | null,
  targetNodeId: string,
): Record<string, StagedLookAt> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let currentId: string | null =
    entryNodeId ?? nodes.slice().sort((a, b) => a.order - b.order)[0]?.id ?? null;
  const seen: Record<string, StagedLookAt> = {};
  let steps = 0;
  let reachedTarget = false;

  const applyOutfitEffects = (effects: EffectLike[]) => {
    for (const effect of effects) {
      if (effect.variableKey !== "outfit" || !effect.characterId) continue;
      if (typeof effect.value !== "string") continue;
      seen[effect.characterId] = {
        sprite: seen[effect.characterId]?.sprite ?? "",
        position: seen[effect.characterId]?.position ?? "",
        outfit: effect.value,
      };
    }
  };

  while (currentId && steps < 500) {
    steps++;
    const node = byId.get(currentId);
    if (!node) break;
    if (node.type === "DIALOGUE") {
      const staged =
        (node.data as { staged?: Array<{ characterId: string; sprite: string; position: string }> })
          .staged ?? [];
      for (const s of staged) {
        seen[s.characterId] = {
          ...seen[s.characterId],
          sprite: s.sprite,
          position: s.position,
        };
      }
    }
    if (node.type === "EFFECT") {
      applyOutfitEffects((node.data as { effects?: EffectLike[] }).effects ?? []);
    }
    if (node.type === "CHOICE") {
      const firstOption = node.choiceOptions.slice().sort((a, b) => a.order - b.order)[0];
      if (firstOption) applyOutfitEffects(firstOption.effects ?? []);
    }
    if (currentId === targetNodeId) {
      reachedTarget = true;
      break;
    }
    if (node.type === "DIALOGUE" || node.type === "EFFECT") {
      currentId = (node.data as { nextNodeId?: string | null }).nextNodeId ?? null;
    } else if (node.type === "CONDITION") {
      const d = node.data as { thenNodeId?: string | null; elseNodeId?: string | null };
      currentId = d.thenNodeId ?? d.elseNodeId ?? null;
    } else if (node.type === "CHOICE") {
      currentId =
        node.choiceOptions.slice().sort((a, b) => a.order - b.order)[0]?.nextNodeId ?? null;
    } else {
      currentId = null; // END, or an unrecognized type - nowhere further to walk.
    }
  }
  return reachedTarget ? seen : {};
}

/** Resolves a character's actual sprite URL for "История" mode's thumbnail from a
 * `currentStagedLookAt` result, mirroring `play_service.py`'s own `_resolve_staged_characters`
 * fallback order exactly: the composed `${outfit}_${pose}` key first (every character with any
 * outfits, via `WardrobeMatrix`, only ever has keys shaped that way - never a bare pose), falling
 * back to the bare pose key for a character with no wardrobe at all (or no tracked outfit yet).
 * Returns `null` (never throws) when neither resolves - `NodeCard` already renders no thumbnail
 * at all for a `null`/`undefined` `thumbnailUrl`. */
export function resolveStagedSpriteUrl(
  sprites: Record<string, string>,
  lookAt: StagedLookAt | undefined,
): string | null {
  if (!lookAt?.sprite) return null;
  if (lookAt.outfit) {
    const composed = sprites[`${lookAt.outfit}_${lookAt.sprite}`];
    if (composed) return composed;
  }
  return sprites[lookAt.sprite] ?? null;
}

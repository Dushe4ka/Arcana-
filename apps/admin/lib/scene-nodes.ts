import type { SceneNodeOut } from "./types";

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

import type { SceneNodeOut } from "./types";

export const NODE_TYPE_LABELS: Record<SceneNodeOut["type"], string> = {
  DIALOGUE: "Диалог",
  CHOICE: "Выбор",
  CONDITION: "Условие",
  EFFECT: "Эффект",
  END: "Конец",
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

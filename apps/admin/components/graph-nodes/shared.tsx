"use client";

import { Handle, Position } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";

import { NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";
import type { SceneNodeOut } from "@/lib/types";

/** Visual (and hit-test) size of every connection handle dot on the chapter graph canvas.
 * React Flow's own default is 6px - fine for a mouse once you know exactly where to aim, but
 * uncomfortably small to actually grab, and the `polish` pass explicitly calls this out. Bumped
 * up here across every custom node so drag-to-connect has a realistic target.
 *
 * This still falls short of the 44px touch-target guideline `polish`'s checklist normally
 * applies - deliberately: this canvas is a mouse-driven desktop authoring surface (React Flow's
 * own drag/zoom/pan model isn't touch-optimized either), and its hit-testing is bound to the
 * handle element's own box, so reaching 44px would need a much heavier custom hit-area overlay
 * rather than a styling tweak. 14px plus React Flow's built-in `.connectionindicator` hover
 * state (toggled by the library itself as the pointer nears a handle, enabling
 * `pointer-events: all` at that moment) is the practical ceiling without that larger project. */
export const HANDLE_SIZE = 16;

/** `hover:scale-125` gives a cheap, honest "you can grab this" affordance without relying on the
 * hit area alone - `motion-reduce:` guards it for `prefers-reduced-motion` per the `polish`
 * checklist, even though a small scale on a tiny dot is a low-risk motion to begin with. */
const handleClassName = "transition-transform hover:scale-125 motion-reduce:hover:scale-100";

const targetHandleStyle: CSSProperties = {
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  border: "2px solid white",
  background: "#6b7280",
};

/** Every node type accepts incoming connections regardless of type, so this is the one handle
 * shape shared unconditionally across all five custom node renderers. */
export function TargetHandle() {
  return <Handle type="target" position={Position.Left} style={targetHandleStyle} className={handleClassName} />;
}

/** A single, unlabeled output handle - DIALOGUE/EFFECT's one "next" connection, where the
 * target is unambiguous enough that a text label would be noise. Centers on the whole
 * `NodeCard` the same way `TargetHandle` does (both are direct children of that card, whose own
 * `position: relative` is their nearest positioned ancestor). */
export function SingleOutputHandle({ id, color }: { id: string; color: string }) {
  return (
    <Handle
      type="source"
      position={Position.Right}
      id={id}
      className={handleClassName}
      style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, border: "2px solid white", background: color }}
    />
  );
}

/** One labeled output row - a source handle plus the text describing what it leads to (a
 * CONDITION branch's "да"/"нет", a CHOICE option's own text). Deliberately a normal block-flow
 * row with `position: relative` rather than a handle positioned by percentage-of-node-height:
 * the handle's default `Position.Right` CSS (`top: 50%` relative to its *nearest positioned
 * ancestor*) then centers it on this row alone, so stacking N rows in a plain flex column makes
 * the node grow to fit exactly N handles with no overlap and no height math to keep in sync
 * with the row count - the CHOICE node's variable option count is exactly the case this
 * matters for. */
export function OutputHandleRow({ id, label, color }: { id: string; label: string; color: string }) {
  return (
    <div className="relative mt-1 flex h-5 items-center justify-end gap-1 pr-2 text-[10px] text-neutral-500">
      {/* `min-w-0` overrides the flex item's default `min-width: auto` (which pins a
       * `white-space: nowrap` element to its full content width and blocks shrinking below
       * that) - without it, `truncate` never actually clips a label that's wider than the row,
       * it just overflows past the card's edge instead. The `.slice(0, 20)` callers already
       * apply keeps this from being reachable with today's data, but the class is asserting
       * a guarantee that must not silently stop being true when copy or the row's width changes. */}
      <span className="min-w-0 truncate">{label}</span>
      <Handle
        type="source"
        position={Position.Right}
        id={id}
        className={handleClassName}
        style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, border: "2px solid white", background: color }}
      />
    </div>
  );
}

/** Outer card every custom node renders. A custom `nodeTypes` entry gets none of the default
 * node's `.react-flow__node-default` styling for free, so this recreates the same look (white
 * card, thin border, rounded corners) the graph used before Task 4's per-type renderers, and
 * adds a blue selection ring so clicking a node still visibly reads as "selected". */
export function NodeCard({
  node,
  selected,
  children,
}: {
  node: SceneNodeOut;
  selected: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative rounded border bg-white px-3 py-2 text-xs shadow-sm ${
        selected ? "border-blue-500 ring-2 ring-blue-200" : "border-neutral-300"
      }`}
      style={{ width: 200 }}
    >
      <TargetHandle />
      <p className="font-medium text-neutral-700">{NODE_TYPE_LABELS[node.type]}</p>
      <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-neutral-600">{nodeSummary(node)}</p>
      {children}
    </div>
  );
}

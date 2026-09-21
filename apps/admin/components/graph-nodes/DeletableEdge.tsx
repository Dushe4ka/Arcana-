"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";

export type DeletableEdgeData = {
  /** Clears whichever link field (`nextNodeId`/`thenNodeId`/`elseNodeId`, or a `ChoiceOption`'s
   * own `nextNodeId`) this specific edge represents - built by `SceneGraphView` from the edge's
   * `data.link` descriptor, so this component itself never needs to know about node types or
   * API paths. */
  onDelete?: () => void;
};

export type DeletableEdgeType = Edge<DeletableEdgeData, "deletable">;

/** The one edge type used for every connection on the chapter graph. A plain edge renders its
 * path fine on its own, but Step 5's explicit, click-based deletion (never the keyboard, per the
 * Global Constraints) needs a floating "x" button positioned on top of the edge -
 * `EdgeLabelRenderer` (the standard v12 way to render arbitrary HTML over an edge) only works
 * from inside a registered edge component that computes its own path; there is no way to bolt it
 * onto the built-in `default` edge type from outside. */
export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
  markerEnd,
  data,
}: EdgeProps<DeletableEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} interactionWidth={24} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "none",
          }}
          className="flex items-center gap-1"
        >
          {label ? (
            <span className="rounded bg-white px-1 py-0.5 text-[10px] text-neutral-600 shadow-sm">{label}</span>
          ) : null}
          {selected && data?.onDelete ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                data.onDelete?.();
              }}
              aria-label="Удалить связь"
              title="Удалить связь"
              className="nodrag nopan flex h-6 w-6 items-center justify-center rounded-full border border-red-300 bg-white text-sm font-semibold leading-none text-red-600 shadow transition-colors hover:bg-red-50 active:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
              style={{ pointerEvents: "all" }}
            >
              ×
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

"use client";

import type { Node, NodeProps } from "@xyflow/react";

import type { SceneNodeOut } from "@/lib/types";
import { NodeCard, OutputHandleRow } from "./shared";

export type ConditionFlowNode = Node<SceneNodeOut, "condition">;

/** CONDITION always has exactly two outputs - `then`/`else` ("да"/"нет" in the scenarist's own
 * terms), matching `data.thenNodeId`/`data.elseNodeId`. Fixed count and order, unlike
 * `ChoiceGraphNode`'s per-option handles, but built from the same `OutputHandleRow` so both
 * grow/shrink by the same rule. */
export function ConditionGraphNode({ data, selected }: NodeProps<ConditionFlowNode>) {
  return (
    <NodeCard node={data} selected={selected}>
      <OutputHandleRow id="then" label="да" color="#16a34a" />
      <OutputHandleRow id="else" label="нет" color="#dc2626" />
    </NodeCard>
  );
}

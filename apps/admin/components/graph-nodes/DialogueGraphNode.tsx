"use client";

import type { Node, NodeProps } from "@xyflow/react";

import { NodeCard, SingleOutputHandle } from "./shared";
import type { GraphNodeData } from "./shared";

export type DialogueFlowNode = Node<GraphNodeData, "dialogue" | "effect">;

/** Renderer shared by DIALOGUE and EFFECT (registered under both `dialogue` and `effect` in
 * `SceneGraphView`'s `nodeTypes`) - both have the exact same handle shape: one incoming
 * connection on the left, one outgoing "next" line on the right, matching `data.nextNodeId`
 * on either node type.
 *
 * `data.storyLabel`/`data.storyThumbnailUrl` are only ever set (by `SceneGraphView`'s
 * `flowNodes` memo) for a DIALOGUE node while in "История" mode - `undefined` for an EFFECT
 * node or a DIALOGUE node in "Глубоко" mode, in which case `NodeCard` falls back to its default
 * `nodeSummary` rendering with no thumbnail. */
export function DialogueGraphNode({ data, selected }: NodeProps<DialogueFlowNode>) {
  return (
    <NodeCard
      node={data}
      selected={selected}
      label={data.storyLabel}
      thumbnailUrl={data.storyThumbnailUrl}
    >
      <SingleOutputHandle id="next" color="#2563eb" />
    </NodeCard>
  );
}

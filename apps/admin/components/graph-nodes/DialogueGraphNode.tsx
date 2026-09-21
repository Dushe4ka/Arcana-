"use client";

import type { Node, NodeProps } from "@xyflow/react";

import type { SceneNodeOut } from "@/lib/types";
import { NodeCard, SingleOutputHandle } from "./shared";

export type DialogueFlowNode = Node<SceneNodeOut, "dialogue" | "effect">;

/** Renderer shared by DIALOGUE and EFFECT (registered under both `dialogue` and `effect` in
 * `SceneGraphView`'s `nodeTypes`) - both have the exact same handle shape: one incoming
 * connection on the left, one outgoing "next" line on the right, matching `data.nextNodeId`
 * on either node type. */
export function DialogueGraphNode({ data, selected }: NodeProps<DialogueFlowNode>) {
  return (
    <NodeCard node={data} selected={selected}>
      <SingleOutputHandle id="next" color="#2563eb" />
    </NodeCard>
  );
}

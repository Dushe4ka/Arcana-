"use client";

import type { Node, NodeProps } from "@xyflow/react";

import { NodeCard, type GraphNodeData } from "./shared";

export type EndFlowNode = Node<GraphNodeData, "end">;

/** END is a terminal node - no outgoing handle at all (nothing to drag a connection from), but
 * still needs the default incoming handle (`NodeCard` already renders that unconditionally) so
 * other nodes can connect INTO it. */
export function EndGraphNode({ data, selected }: NodeProps<EndFlowNode>) {
  return <NodeCard node={data} selected={selected} />;
}

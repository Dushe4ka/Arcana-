"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeChange,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { apiRequest } from "@/lib/api";
import { NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";
import type { CharacterOut, SceneNodeOut } from "@/lib/types";
import { NodeEditorPanel } from "./NodeEditorPanel";

/** Every edge a scene node's `data` can imply, across all five node types - one place that
 * knows how to turn "what this node points at" into graph edges, so the graph view doesn't
 * need type-specific branching scattered elsewhere. */
function edgesForNode(node: SceneNodeOut): Edge[] {
  const d = node.data as Record<string, unknown>;
  const edges: Edge[] = [];
  const addEdge = (targetId: unknown, label?: string) => {
    if (typeof targetId === "string" && targetId) {
      edges.push({
        id: `${node.id}-${targetId}-${label ?? ""}`,
        source: node.id,
        target: targetId,
        label,
      });
    }
  };

  if (node.type === "DIALOGUE" || node.type === "EFFECT") addEdge(d.nextNodeId);
  if (node.type === "CONDITION") {
    addEdge(d.thenNodeId, "да");
    addEdge(d.elseNodeId, "нет");
  }
  if (node.type === "CHOICE") {
    for (const option of node.choiceOptions) {
      if (typeof option.nextNodeId === "string" && option.nextNodeId) {
        edges.push({
          id: `${node.id}-${option.id}`,
          source: node.id,
          target: option.nextNodeId,
          label: option.text.ru.slice(0, 20),
        });
      }
    }
  }
  return edges;
}

export function SceneGraphView({
  nodes: sceneNodes,
  characters,
  onNodesChanged,
}: {
  nodes: SceneNodeOut[];
  characters: CharacterOut[];
  onNodesChanged: () => void;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const flowNodes = useMemo<Node[]>(
    () =>
      sceneNodes.map((n, i) => ({
        id: n.id,
        position: { x: n.canvasX ?? (i % 5) * 220, y: n.canvasY ?? Math.floor(i / 5) * 140 },
        data: { label: `${NODE_TYPE_LABELS[n.type]}\n${nodeSummary(n)}` },
        style: { whiteSpace: "pre-line" as const, fontSize: 12, width: 180 },
      })),
    [sceneNodes],
  );

  const flowEdges = useMemo<Edge[]>(() => sceneNodes.flatMap(edgesForNode), [sceneNodes]);

  // Local, mutable copy of the graph's node positions - React Flow is a controlled
  // component (it needs `nodes` state it can apply drag changes to via `onNodesChange`
  // before a drag ends), so this can't just be `flowNodes` directly. Resynced whenever a
  // reload produces a genuinely new `flowNodes` (e.g. after a save elsewhere changes node
  // content), not on every render.
  const [localNodes, setLocalNodes] = useState<Node[]>(flowNodes);
  useEffect(() => {
    // Syncing controlled React Flow node state from the `sceneNodes` prop after a reload,
    // not a fetch itself, but the same rule flags any setState reachable from an effect
    // regardless of shape.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalNodes(flowNodes);
  }, [flowNodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setLocalNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onNodeDragStop = useCallback(async (_: unknown, node: Node) => {
    try {
      await apiRequest(`/admin/scene-nodes/${node.id}`, {
        method: "PATCH",
        body: JSON.stringify({ canvasX: Math.round(node.position.x), canvasY: Math.round(node.position.y) }),
      });
    } catch {
      // Position persistence failing isn't worth blocking the drag interaction over - the
      // node just won't remember its spot on next load. Silent by design here (not a data
      // change that needs the same error-surface rigor as content mutations).
    }
  }, []);

  const selectedNode = sceneNodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex h-[600px] gap-4">
      <div className="flex-1 rounded border border-neutral-200">
        <ReactFlow
          nodes={localNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          deleteKeyCode={null}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      {selectedNode && (
        <div className="w-80 shrink-0 overflow-y-auto rounded border border-neutral-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{NODE_TYPE_LABELS[selectedNode.type]}</span>
            <button onClick={() => setSelectedNodeId(null)} className="text-xs text-neutral-500 underline">
              Закрыть
            </button>
          </div>
          <NodeEditorPanel
            key={selectedNode.id}
            node={selectedNode}
            allNodes={sceneNodes}
            characters={characters}
            onSaved={onNodesChanged}
          />
        </div>
      )}
    </div>
  );
}

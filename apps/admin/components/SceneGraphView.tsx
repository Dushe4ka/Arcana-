"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ViewportPortal,
  type Node,
  type Edge,
  type NodeChange,
  type ReactFlowInstance,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";

import { apiRequest, ApiError } from "@/lib/api";
import { previewHref } from "@/lib/preview";
import { DEFAULT_DATA_BY_TYPE, NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";
import type { CharacterOut, SceneNodeOut } from "@/lib/types";
import { NodeEditorPanel } from "./NodeEditorPanel";
import { NodeTypeMenu, type NodeTypeChoice } from "./NodeTypeMenu";

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
  storyId,
  chapterId,
  onNodesChanged,
}: {
  nodes: SceneNodeOut[];
  characters: CharacterOut[];
  storyId: string;
  chapterId: string;
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

  // Captured via `onInit` rather than `useReactFlow()` - this component's own body renders
  // `<ReactFlow>` itself (it isn't a descendant of one), so it sits outside the internal
  // `ReactFlowProvider` that `<ReactFlow>` wraps around ITS OWN children; calling the
  // `useReactFlow()` hook here would throw for lacking that context. The instance object
  // handed to `onInit` carries its own bound methods (`screenToFlowPosition` included) that
  // work from any call site once captured, so this sidesteps the provider entirely.
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // Flow-space (not screen-space) position of a pending click-to-create menu - the same
  // coordinate system `canvasX`/`canvasY` and node positions already use. Rendered via
  // `<ViewportPortal>` below so the menu pans/zooms together with the canvas instead of this
  // component having to keep it in sync with the viewport transform itself.
  const [pendingMenuPosition, setPendingMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Polish pass: unlike `onNodeDragStop`'s silent-catch (a failed position save is invisible and
  // harmless - the node still exists and works), a failed node CREATE is a total no-op the
  // scenarist would otherwise see zero feedback for - the menu would just sit there having
  // seemingly done nothing. `isCreatingNode` also doubles as a double-submission guard (disables
  // every `NodeTypeMenu` button while a request is in flight), same role `isQuickActionPending`
  // plays for `QuickAddToolbar` in the parent page.
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [createNodeError, setCreateNodeError] = useState<string | null>(null);

  // Mirrors `page.tsx`'s `nextOrder()` - always one past the current highest `order`, so a
  // click-to-create can't collide with an existing node's order even after mid-chapter deletions.
  const nextOrderForGraph = (): number => Math.max(-1, ...sceneNodes.map((n) => n.order)) + 1;

  // Creates an unconnected node (no `nextNodeId`/option routing set) at the exact point the
  // scenarist clicked - deliberately NOT auto-chained onto the chapter's last node, unlike
  // `QuickAddToolbar`'s quick actions in the parent page. Matches the spec verbatim: a
  // click-to-create produces a node with no incoming or outgoing connection.
  //
  // `canvasX`/`canvasY` are NOT part of the POST payload, despite `onNodeDragStop` sending
  // them alongside a PATCH - verified against the backend's actual schemas
  // (`apps/api/app/schemas/content.py`): every `*NodeCreate` variant behind
  // `SceneNodeCreateInput` only declares `type`/`chapterId`/`order`/`data`, and `CamelModel`
  // carries no `extra="forbid"`, so a `canvasX`/`canvasY` sent on POST is silently dropped
  // (confirmed live: the node was created with `canvasX: null` even though those keys were in
  // the request body). Only `SceneNodeUpdateInput` (the PATCH schema `onNodeDragStop` already
  // uses) has them. So this follows up the create with the same PATCH `onNodeDragStop` makes
  // after a drag, rather than trying to set the position at create time.
  const onPickFromEmptyCanvas = async (choice: NodeTypeChoice, position: { x: number; y: number }) => {
    if (isCreatingNode) return;
    setIsCreatingNode(true);
    setCreateNodeError(null);
    const payload =
      choice.kind === "dialogue"
        ? {
            type: "DIALOGUE" as const,
            chapterId,
            order: nextOrderForGraph(),
            data: { speakerCharacterId: choice.characterId, text: { ru: "…" }, staged: [] },
          }
        : {
            type: choice.type,
            chapterId,
            order: nextOrderForGraph(),
            data: DEFAULT_DATA_BY_TYPE[choice.type],
          };
    try {
      const newNode = await apiRequest<SceneNodeOut>("/admin/scene-nodes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      try {
        await apiRequest(`/admin/scene-nodes/${newNode.id}`, {
          method: "PATCH",
          body: JSON.stringify({ canvasX: Math.round(position.x), canvasY: Math.round(position.y) }),
        });
      } catch {
        // Same tradeoff as `onNodeDragStop` above: not worth failing the whole click-to-create
        // over a position-save hiccup - the node exists (just not pinned exactly at the click
        // point yet; it'll fall back to the grid layout `flowNodes` computes for a `null`
        // `canvasX`/`canvasY` until it's dragged once).
      }
      setPendingMenuPosition(null);
      onNodesChanged();
    } catch (err) {
      // The menu stays open (unlike a success, which closes it) so the scenarist can retry the
      // same click without having to re-open the menu from scratch.
      setCreateNodeError(err instanceof ApiError ? err.message : "Не удалось создать узел");
    } finally {
      setIsCreatingNode(false);
    }
  };

  return (
    <div className="flex h-[600px] gap-4">
      <div className="flex-1 rounded border border-neutral-200">
        <ReactFlow
          nodes={localNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={(event) => {
            if (!reactFlowInstance) return;
            setPendingMenuPosition(reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
          }}
          onInit={setReactFlowInstance}
          deleteKeyCode={null}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
          {pendingMenuPosition && (
            <ViewportPortal>
              <NodeTypeMenu
                position={pendingMenuPosition}
                storyId={storyId}
                characters={characters}
                disabled={isCreatingNode}
                error={createNodeError}
                onPick={(choice) => onPickFromEmptyCanvas(choice, pendingMenuPosition)}
                onClose={() => {
                  setPendingMenuPosition(null);
                  setCreateNodeError(null);
                }}
                onNewCharacter={onNodesChanged}
              />
            </ViewportPortal>
          )}
        </ReactFlow>
      </div>
      {selectedNode && (
        <div className="w-80 shrink-0 overflow-y-auto rounded border border-neutral-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{NODE_TYPE_LABELS[selectedNode.type]}</span>
            <div className="flex items-center gap-3">
              <Link
                href={previewHref(storyId, chapterId, selectedNode.id)}
                className="text-xs text-neutral-600 underline"
              >
                ▶ Превью отсюда
              </Link>
              <button onClick={() => setSelectedNodeId(null)} className="text-xs text-neutral-500 underline">
                Закрыть
              </button>
            </div>
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ViewportPortal,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";

import { apiRequest, ApiError } from "@/lib/api";
import { previewHref } from "@/lib/preview";
import {
  currentStagedLookAt,
  DEFAULT_DATA_BY_TYPE,
  NODE_TYPE_LABELS,
  storyModeLabel,
} from "@/lib/scene-nodes";
import type { CharacterOut, SceneNodeOut } from "@/lib/types";
import { NodeEditorPanel } from "./NodeEditorPanel";
import { NodeTypeMenu, type NodeTypeChoice } from "./NodeTypeMenu";
import { ChoiceGraphNode } from "./graph-nodes/ChoiceGraphNode";
import { ConditionGraphNode } from "./graph-nodes/ConditionGraphNode";
import { DeletableEdge, type DeletableEdgeData } from "./graph-nodes/DeletableEdge";
import { DialogueGraphNode } from "./graph-nodes/DialogueGraphNode";
import { EndGraphNode } from "./graph-nodes/EndGraphNode";
import type { GraphNodeData } from "./graph-nodes/shared";

/** Session-local only - "История" (a scenarist-friendly speaker+text view, the friendlier
 * default for someone who just opened the graph) vs. "Глубоко" (the existing full technical
 * summary). Deliberately `useState`, never persisted to the DB - purely how this one browser
 * tab currently likes to look at the graph. */
type ViewMode = "story" | "deep";

// Module-level constants (not recreated per render) - React Flow warns if `nodeTypes`/`edgeTypes`
// is a fresh object every render (it treats identity change as "the type map itself changed" and
// tears down/rebuilds internal state for it).
const NODE_TYPES: NodeTypes = {
  dialogue: DialogueGraphNode,
  effect: DialogueGraphNode,
  choice: ChoiceGraphNode,
  condition: ConditionGraphNode,
  end: EndGraphNode,
};
const EDGE_TYPES: EdgeTypes = { deletable: DeletableEdge };

/** What a given edge on the chapter graph would need cleared to remove that connection - built
 * by `edgesForNode` (which only knows about `SceneNodeOut`/`ChoiceOptionOut` shapes) and consumed
 * by `SceneGraphView`'s `deleteEdgeLink` (which has `apiRequest`/`sceneNodes` in scope) so the
 * "what does this edge represent" logic and the "how do I delete it" logic can't drift apart. */
type EdgeLink =
  | { kind: "node-field"; nodeId: string; field: "nextNodeId" | "thenNodeId" | "elseNodeId" }
  | { kind: "choice-option"; optionId: string };

/** Every edge a scene node's `data` can imply, across all five node types - one place that
 * knows how to turn "what this node points at" into graph edges, so the graph view doesn't
 * need type-specific branching scattered elsewhere. Each edge also carries `sourceHandle`
 * (matching the exact `<Handle id="...">` the corresponding graph-nodes/* renderer draws) so
 * React Flow anchors it to the right dot instead of the node's center, and a `link` descriptor
 * (in `data`) recording which field a delete action on this edge should clear. */
function edgesForNode(node: SceneNodeOut): Edge<{ link: EdgeLink }>[] {
  const d = node.data as Record<string, unknown>;
  const edges: Edge<{ link: EdgeLink }>[] = [];
  const addEdge = (
    targetId: unknown,
    handleId: string,
    field: "nextNodeId" | "thenNodeId" | "elseNodeId",
    label?: string,
  ) => {
    if (typeof targetId === "string" && targetId) {
      edges.push({
        id: `${node.id}-${targetId}-${label ?? ""}`,
        source: node.id,
        sourceHandle: handleId,
        target: targetId,
        label,
        data: { link: { kind: "node-field", nodeId: node.id, field } },
      });
    }
  };

  if (node.type === "DIALOGUE" || node.type === "EFFECT")
    addEdge(d.nextNodeId, "next", "nextNodeId");
  if (node.type === "CONDITION") {
    addEdge(d.thenNodeId, "then", "thenNodeId", "да");
    addEdge(d.elseNodeId, "else", "elseNodeId", "нет");
  }
  if (node.type === "CHOICE") {
    for (const option of node.choiceOptions) {
      if (typeof option.nextNodeId === "string" && option.nextNodeId) {
        edges.push({
          id: `${node.id}-${option.id}`,
          source: node.id,
          sourceHandle: option.id,
          target: option.nextNodeId,
          label: option.text.ru.slice(0, 20),
          data: { link: { kind: "choice-option", optionId: option.id } },
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
  entryNodeId,
  onNodesChanged,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: SceneNodeOut[];
  characters: CharacterOut[];
  storyId: string;
  chapterId: string;
  /** The chapter's `entryNodeId` (`ChapterOut.entryNodeId`) - seeds `currentStagedLookAt`'s
   * forward walk in "История" mode so a DIALOGUE node's thumbnail reflects a character's
   * sprite/outfit as of that point in the story, not just whatever `staged` entry it happens to
   * carry itself. */
  entryNodeId: string | null;
  onNodesChanged: () => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Defaults to "История" - the friendlier default for a scenarist who just opened the graph.
  // Session-local (see `ViewMode`'s own comment) - never written back to the chapter/node data.
  const [viewMode, setViewMode] = useState<ViewMode>("story");

  const flowNodes = useMemo<Node<GraphNodeData>[]>(
    () =>
      sceneNodes.map((n, i) => {
        // Only DIALOGUE nodes get a story-mode label/thumbnail at all (see `storyModeLabel`'s
        // own fallback for every other type) - and only computed in "История" mode in the first
        // place, since `currentStagedLookAt`'s walk is pure overhead in "Глубоко".
        let storyLabel: string | undefined;
        let storyThumbnailUrl: string | null | undefined;
        if (viewMode === "story" && n.type === "DIALOGUE") {
          storyLabel = storyModeLabel(n, characters);
          const speakerCharacterId = (n.data as { speakerCharacterId?: string | null })
            .speakerCharacterId;
          const speaker = speakerCharacterId
            ? characters.find((c) => c.id === speakerCharacterId)
            : null;
          if (speaker) {
            const lookAt = currentStagedLookAt(sceneNodes, entryNodeId, n.id);
            const spriteKey = lookAt[speaker.id]?.sprite;
            storyThumbnailUrl = spriteKey ? (speaker.sprites[spriteKey] ?? null) : null;
          }
        }
        return {
          id: n.id,
          type: n.type.toLowerCase(),
          position: { x: n.canvasX ?? (i % 5) * 220, y: n.canvasY ?? Math.floor(i / 5) * 140 },
          data: { ...n, storyLabel, storyThumbnailUrl },
        };
      }),
    [sceneNodes, characters, viewMode, entryNodeId],
  );

  // Surfaces a failed connect/disconnect (drag-to-connect, drag-to-empty-space's follow-up
  // connect, or an edge delete) - these all happen via direct canvas gestures with no other
  // feedback surface, so a silent failure would look identical to "nothing happened" (the edge
  // just wouldn't be there on next reload, with no indication why).
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Shared by `onConnect` (drag between two EXISTING nodes) and `onPickFromEmptyCanvas`'s
  // follow-up connect (drag to empty space, Step 4) - "given a source node + optional source
  // handle + a target node id, patch whichever field that source/handle combination means" is
  // exactly the same four-way type branch either way; this is the one place it's written.
  const connectNodes = useCallback(
    async (sourceNode: SceneNodeOut, sourceHandleId: string | null, targetNodeId: string) => {
      if (sourceNode.type === "DIALOGUE" || sourceNode.type === "EFFECT") {
        await apiRequest(`/admin/scene-nodes/${sourceNode.id}`, {
          method: "PATCH",
          body: JSON.stringify({ data: { ...sourceNode.data, nextNodeId: targetNodeId } }),
        });
      } else if (sourceNode.type === "CONDITION") {
        const field = sourceHandleId === "then" ? "thenNodeId" : "elseNodeId";
        await apiRequest(`/admin/scene-nodes/${sourceNode.id}`, {
          method: "PATCH",
          body: JSON.stringify({ data: { ...sourceNode.data, [field]: targetNodeId } }),
        });
      } else if (sourceNode.type === "CHOICE") {
        // `sourceHandleId` is the dragged-from ChoiceOption's own id (see `ChoiceGraphNode`'s
        // per-option `<Handle id={option.id}>`) - nothing to do if somehow missing.
        if (!sourceHandleId) return;
        await apiRequest(`/admin/choice-options/${sourceHandleId}`, {
          method: "PATCH",
          body: JSON.stringify({ nextNodeId: targetNodeId }),
        });
      }
      // END has no source handle to drag from in the first place - nothing to branch on here.
    },
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = sceneNodes.find((n) => n.id === connection.source);
      if (!sourceNode) return;
      setConnectionError(null);
      connectNodes(sourceNode, connection.sourceHandle, connection.target)
        .then(onNodesChanged)
        .catch((err) =>
          setConnectionError(err instanceof ApiError ? err.message : "Не удалось создать связь"),
        );
    },
    [sceneNodes, connectNodes, onNodesChanged],
  );

  const deleteEdgeLink = useCallback(
    async (link: EdgeLink) => {
      setConnectionError(null);
      try {
        if (link.kind === "node-field") {
          const sourceNode = sceneNodes.find((n) => n.id === link.nodeId);
          if (!sourceNode) return;
          await apiRequest(`/admin/scene-nodes/${sourceNode.id}`, {
            method: "PATCH",
            body: JSON.stringify({ data: { ...sourceNode.data, [link.field]: null } }),
          });
        } else {
          await apiRequest(`/admin/choice-options/${link.optionId}`, {
            method: "PATCH",
            body: JSON.stringify({ nextNodeId: null }),
          });
        }
        setSelectedEdgeId(null);
        onNodesChanged();
      } catch (err) {
        setConnectionError(err instanceof ApiError ? err.message : "Не удалось удалить связь");
      }
    },
    [sceneNodes, onNodesChanged],
  );

  const flowEdges = useMemo<Edge<DeletableEdgeData>[]>(
    () =>
      sceneNodes.flatMap(edgesForNode).map((edge): Edge<DeletableEdgeData> => ({
        ...edge,
        type: "deletable",
        selected: edge.id === selectedEdgeId,
        data: { onDelete: () => deleteEdgeLink(edge.data!.link) },
      })),
    [sceneNodes, selectedEdgeId, deleteEdgeLink],
  );

  // Local, mutable copy of the graph's node positions - React Flow is a controlled
  // component (it needs `nodes` state it can apply drag changes to via `onNodesChange`
  // before a drag ends), so this can't just be `flowNodes` directly. Resynced whenever a
  // reload produces a genuinely new `flowNodes` (e.g. after a save elsewhere changes node
  // content), not on every render.
  const [localNodes, setLocalNodes] = useState<Node<GraphNodeData>[]>(flowNodes);
  useEffect(() => {
    // Syncing controlled React Flow node state from the `sceneNodes` prop after a reload,
    // not a fetch itself, but the same rule flags any setState reachable from an effect
    // regardless of shape.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalNodes(flowNodes);
  }, [flowNodes]);

  // Cast at this one boundary rather than fighting `@xyflow/react`'s generic `Node<Data>`
  // inference across the whole component: `NodeChange`/`applyNodeChanges` are typed generically
  // over the library's own `Node`, and only ever describe position/dimension/selection changes
  // for drag interactions here (never an add/replace that would fabricate a `data` payload out
  // of nothing) - so the cast back to `Node<GraphNodeData>[]` is safe in practice, not just at
  // the type level.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setLocalNodes((nds) => applyNodeChanges(changes, nds as Node[]) as Node<GraphNodeData>[]);
  }, []);

  const onNodeDragStop = useCallback(async (_: unknown, node: Node) => {
    try {
      await apiRequest(`/admin/scene-nodes/${node.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          canvasX: Math.round(node.position.x),
          canvasY: Math.round(node.position.y),
        }),
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

  // Flow-space (not screen-space) position of a pending click-to-create/drag-to-empty-space
  // menu - the same coordinate system `canvasX`/`canvasY` and node positions already use.
  // Rendered via `<ViewportPortal>` below so the menu pans/zooms together with the canvas
  // instead of this component having to keep it in sync with the viewport transform itself.
  const [pendingMenuPosition, setPendingMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Set only when the menu was opened by a drag-to-empty-space gesture (Step 4) - remembers
  // which node/handle the drag started from so `onPickFromEmptyCanvas` can wire up the new
  // node as that handle's target in the same gesture. Left `null` for a plain empty-canvas
  // click (Task 3's flow): the new node is created unconnected, exactly as before.
  const [pendingConnectionSource, setPendingConnectionSource] = useState<{
    nodeId: string;
    handleId: string | null;
  } | null>(null);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      // `isValid: true` means the drag landed on a real target handle - `onConnect` already
      // fired and handled it, so opening the create-menu here too would be a second, unwanted
      // action for the same gesture. `false` or `null` (never got near a valid handle at all -
      // exactly the "dropped in empty space" case) both mean it didn't.
      if (connectionState.isValid || !connectionState.fromHandle || !reactFlowInstance) return;
      // Defensive: every node's incoming `TargetHandle` sets `isConnectableStart={false}`
      // (`graph-nodes/shared.tsx`), which should make it impossible for a drag to ever START
      // there in the first place - so `fromHandle` reaching this point should always be a
      // `"source"` handle. Checking explicitly documents that invariant rather than trusting it
      // silently: if some future handle forgets to set the prop, treating its node as a
      // connection source below would misattribute the drag and silently overwrite whatever
      // that node's real outgoing connection already pointed at (`nextNodeId`/`elseNodeId`/...).
      if (connectionState.fromHandle.type !== "source") return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!point) return;
      setPendingConnectionSource({
        nodeId: connectionState.fromHandle.nodeId,
        handleId: connectionState.fromHandle.id ?? null,
      });
      setPendingMenuPosition(
        reactFlowInstance.screenToFlowPosition({ x: point.clientX, y: point.clientY }),
      );
    },
    [reactFlowInstance],
  );

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

  // Creates a node at the exact point the scenarist clicked or dragged to. Plain empty-canvas
  // click (Task 3): deliberately NOT auto-chained onto the chapter's last node - the new node
  // has no incoming or outgoing connection. Drag-to-empty-space (Task 4, `pendingConnectionSource`
  // set): the same create, immediately followed by the same `connectNodes` an `onConnect` between
  // two existing nodes would run, using the just-created node's id as the target - one gesture,
  // both a new node AND a wired connection.
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
  const onPickFromEmptyCanvas = async (
    choice: NodeTypeChoice,
    position: { x: number; y: number },
  ) => {
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
          body: JSON.stringify({
            canvasX: Math.round(position.x),
            canvasY: Math.round(position.y),
          }),
        });
      } catch {
        // Same tradeoff as `onNodeDragStop` above: not worth failing the whole click-to-create
        // over a position-save hiccup - the node exists (just not pinned exactly at the click
        // point yet; it'll fall back to the grid layout `flowNodes` computes for a `null`
        // `canvasX`/`canvasY` until it's dragged once).
      }
      if (pendingConnectionSource) {
        const sourceNode = sceneNodes.find((n) => n.id === pendingConnectionSource.nodeId);
        if (sourceNode) {
          try {
            await connectNodes(sourceNode, pendingConnectionSource.handleId, newNode.id);
          } catch (err) {
            // The node itself was created fine - only the follow-up connection failed. Surfaced
            // through the same `connectionError` channel edge deletes/drag-connects use, not
            // `createNodeError`, since node creation itself succeeded.
            setConnectionError(
              err instanceof ApiError ? err.message : "Узел создан, но не удалось создать связь",
            );
          }
        }
      }
      setPendingMenuPosition(null);
      setPendingConnectionSource(null);
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
    <div>
      <div className="mb-2 flex gap-2 text-xs">
        <button
          onClick={() => setViewMode("story")}
          className={viewMode === "story" ? "font-semibold underline" : "text-neutral-600"}
        >
          История
        </button>
        <button
          onClick={() => setViewMode("deep")}
          className={viewMode === "deep" ? "font-semibold underline" : "text-neutral-600"}
        >
          Глубоко
        </button>
      </div>
      <div className="flex h-[600px] gap-4">
        <div className="relative flex-1 rounded border border-neutral-200">
          {connectionError && (
            <div className="absolute z-30 m-2 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700 shadow">
              {connectionError}
              <button
                type="button"
                onClick={() => setConnectionError(null)}
                className="ml-2 underline"
              >
                Скрыть
              </button>
            </div>
          )}
          <ReactFlow
            nodes={localNodes}
            edges={flowEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_, node) => {
              onSelectNode(node.id);
              setSelectedEdgeId(null);
            }}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onEdgeClick={(_, edge) =>
              setSelectedEdgeId((prev) => (prev === edge.id ? null : edge.id))
            }
            onPaneClick={(event) => {
              setSelectedEdgeId(null);
              if (!reactFlowInstance) return;
              setPendingConnectionSource(null);
              setPendingMenuPosition(
                reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
              );
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
                    setPendingConnectionSource(null);
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
                <button
                  onClick={() => onSelectNode(null)}
                  className="text-xs text-neutral-500 underline"
                >
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
    </div>
  );
}

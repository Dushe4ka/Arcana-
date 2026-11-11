"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";

import { apiRequest, ApiError } from "@/lib/api";
import { previewHref } from "@/lib/preview";
import { DEFAULT_DATA_BY_TYPE } from "@/lib/scene-nodes";
import type { CharacterOut, SceneNodeOut } from "@/lib/types";
import type { LocalizedText } from "@arcana/shared";
import { NodeEditorPanel } from "./NodeEditorPanel";

/* The story graph workspace: one canvas, three zoom levels of the same real script data.
 *
 *   Серия  - every beat of one chapter, editable: drag to arrange, pull a link from a node's
 *            port to rewire the script, delete a link, add beats.
 *   Сезон  - the chapters of a season with their decisions and gated events, to see how a
 *            choice in one chapter plays out in another.
 *   История - all seasons; chapters open on demand.
 *
 * Two kinds of line, never to be confused: a solid line is a direct transition (this beat is
 * followed by that one); a dashed gold line is a deferred consequence (a decision changes a
 * characteristic or a flag that a later event checks). */

type Kind = "DIALOGUE" | "CHOICE" | "CONDITION" | "EFFECT" | "END" | "OPTION";
type GNode = {
  id: string;
  chapterId: string;
  kind: Kind;
  parentId?: string;
  label: string;
  speaker?: string | null;
  x: number | null;
  y: number | null;
  conditions: string[];
  effects: string[];
  cost?: string | null;
  isEntry: boolean;
};
type GFlow = { from: string; to: string; kind: "next" | "option" | "then" | "else"; label?: string; broken: boolean; crossChapter: boolean };
type GInfluence = { from: string; to: string; variable: string; crossChapter: boolean };
type GChapter = {
  id: string;
  seasonId: string;
  seasonIndex: number;
  index: number;
  order: number;
  title: LocalizedText;
  status: string;
  entryNodeId: string | null;
  nodeCount: number;
};
type Graph = {
  title: LocalizedText;
  seasons: { id: string; index: number; title: LocalizedText }[];
  chapters: GChapter[];
  nodes: GNode[];
  flow: GFlow[];
  influences: GInfluence[];
  truncated: boolean;
};
type View = "chapter" | "season" | "story";
type Mode = "down" | "up" | null;

// --- look: the "Кинозал" treatment chosen by the owner -----------------------------------
const INK = "#0d0b09";
const FLOW = "#8a7550";
const GOLD = "#d4af6a";
const TEXT = "#f3ece0";
const MUTED = "#b8a99a";
const KIND_LOOK: Record<Kind | "CHAPTER" | "PORTAL", { fill: string; ring: string; name: string }> = {
  DIALOGUE: { fill: "radial-gradient(circle at 35% 30%, #3a3027, #17120e)", ring: "#4a3f30", name: "Реплика" },
  CHOICE: { fill: "radial-gradient(circle at 35% 30%, #f0d9a4, #b08a45)", ring: "#f0d9a4", name: "Выбор" },
  OPTION: { fill: "radial-gradient(circle at 35% 30%, #fff7e6, #cdbb96)", ring: "#fff7e6", name: "Вариант выбора" },
  CONDITION: { fill: "radial-gradient(circle at 35% 30%, #e0b5b0, #96615c)", ring: "#e0b5b0", name: "Условие" },
  EFFECT: { fill: "radial-gradient(circle at 35% 30%, #8fb5ae, #3f6660)", ring: "#a9cfc8", name: "Эффект" },
  END: { fill: "radial-gradient(circle at 35% 30%, #9a3f50, #4a1a24)", ring: "#b8566a", name: "Финал" },
  CHAPTER: { fill: "radial-gradient(circle at 35% 30%, #2f2820, #14100d)", ring: GOLD, name: "Серия" },
  PORTAL: { fill: "transparent", ring: GOLD, name: "Другая серия" },
};

type CircleData = {
  kind: Kind | "CHAPTER" | "PORTAL";
  label: string;
  badge?: string;
  dim: boolean;
  selected: boolean;
  isEntry?: boolean;
  open?: boolean;
  canToggle?: boolean;
  onToggle?: () => void;
  editable: boolean;
  current?: boolean;
};

const CircleNode = memo(function CircleNode({ data }: NodeProps<Node<CircleData>>) {
  const look = KIND_LOOK[data.kind];
  const big = data.kind === "CHAPTER";
  const size = big ? 66 : data.kind === "PORTAL" ? 30 : 44;
  const handle = { width: 9, height: 9, background: INK, border: `1.5px solid ${FLOW}`, opacity: data.editable ? 1 : 0 } as const;
  return (
    <div style={{ width: 170, opacity: data.dim ? 0.13 : 1, transition: "opacity .25s" }} className="flex flex-col items-center">
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: look.fill,
          border: `${data.selected || data.current ? 3 : 2}px ${data.kind === "PORTAL" ? "dashed" : "solid"} ${look.ring}`,
          boxShadow: data.selected ? `0 0 0 6px rgba(212,175,106,.18), 0 0 28px rgba(212,175,106,.45)` : "0 6px 18px rgba(0,0,0,.55)",
          position: "relative",
          display: "grid",
          placeItems: "center",
          color: GOLD,
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        {big ? data.badge : null}
        <Handle type="target" position={Position.Left} style={{ ...handle, left: -5 }} isConnectable={data.editable} />
        {data.kind === "CONDITION" ? (
          <>
            <Handle id="then" type="source" position={Position.Right} style={{ ...handle, right: -5, top: "28%" }} isConnectable={data.editable} />
            <Handle id="else" type="source" position={Position.Right} style={{ ...handle, right: -5, top: "72%" }} isConnectable={data.editable} />
          </>
        ) : (
          <Handle
            type="source"
            position={Position.Right}
            style={{ ...handle, right: -5, opacity: data.editable && data.kind !== "END" && data.kind !== "CHOICE" ? 1 : 0 }}
            isConnectable={data.editable && data.kind !== "END" && data.kind !== "CHOICE"}
          />
        )}
        {data.isEntry && (
          <span style={{ position: "absolute", top: -9, left: -9, fontSize: 10, background: GOLD, color: INK, borderRadius: 8, padding: "0 5px", fontWeight: 700 }}>
            старт
          </span>
        )}
        {data.canToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onToggle?.();
            }}
            aria-label={data.open ? "Свернуть серию" : "Раскрыть серию"}
            className="nodrag"
            style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: INK, border: `1px solid ${GOLD}`, color: GOLD, fontSize: 13, lineHeight: "17px" }}
          >
            {data.open ? "−" : "+"}
          </button>
        )}
        {!big && data.badge && (
          <span style={{ position: "absolute", bottom: -7, right: -9, fontSize: 9.5, background: "#1a1613", color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 8, padding: "0 4px" }}>
            {data.badge}
          </span>
        )}
      </div>
      <div
        style={{
          marginTop: 8,
          maxWidth: 170,
          padding: "3px 10px",
          borderRadius: 11,
          background: "#1a1613",
          border: "1px solid #3a3128",
          color: TEXT,
          fontSize: big ? 12.5 : 11.5,
          fontWeight: 600,
          lineHeight: 1.25,
          textAlign: "center",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {data.label || "—"}
      </div>
    </div>
  );
});
const NODE_TYPES = { circle: CircleNode };

const chapterTag = (c: GChapter) => `С${c.seasonIndex}·Г${c.index}`;

/** Left-to-right layers from the chapter entry; anything unreachable is parked in a row below. */
function autoLayout(nodes: GNode[], flow: GFlow[], entryId: string | null): Record<string, { x: number; y: number }> {
  const ids = new Set(nodes.map((n) => n.id));
  const next: Record<string, string[]> = {};
  flow.forEach((e) => {
    if (ids.has(e.from) && ids.has(e.to)) (next[e.from] ??= []).push(e.to);
  });
  const layer: Record<string, number> = {};
  const queue: string[] = [];
  if (entryId && ids.has(entryId)) {
    layer[entryId] = 0;
    queue.push(entryId);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const target of next[cur] ?? []) {
      if (layer[target] === undefined) {
        layer[target] = layer[cur] + 1;
        queue.push(target);
      }
    }
  }
  const rows: Record<number, number> = {};
  const result: Record<string, { x: number; y: number }> = {};
  const maxLayer = Math.max(0, ...Object.values(layer));
  let orphan = 0;
  nodes.forEach((n) => {
    if (layer[n.id] === undefined) {
      result[n.id] = { x: orphan++ * 200, y: 620 };
      return;
    }
    const row = (rows[layer[n.id]] = (rows[layer[n.id]] ?? -1) + 1);
    result[n.id] = { x: layer[n.id] * 190, y: row * 130 };
  });
  // Centre each layer vertically around the tallest one.
  const tallest = Math.max(1, ...Object.values(rows).map((r) => r + 1));
  nodes.forEach((n) => {
    if (layer[n.id] !== undefined) result[n.id].y += ((tallest - (rows[layer[n.id]] + 1)) * 130) / 2;
  });
  void maxLayer;
  return result;
}

export function StoryGraphExplorer({
  storyId,
  initialChapterId,
  initialView,
  initialNodeId,
  characters,
}: {
  storyId: string;
  initialChapterId: string | null;
  initialView: View;
  initialNodeId: string | null;
  characters: CharacterOut[];
}) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [sceneNodes, setSceneNodes] = useState<SceneNodeOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [chapterId, setChapterId] = useState<string | null>(initialChapterId);
  const [selected, setSelected] = useState<string | null>(initialNodeId);
  const [mode, setMode] = useState<Mode>(initialNodeId ? "down" : null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<Graph>(`/admin/stories/${storyId}/graph`);
      setGraph(data);
      setError(null);
      setChapterId((current) => current ?? data.chapters[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить граф");
    }
  }, [storyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, [load]);

  // The chapter view edits real nodes, so it needs their full data (for the editor panel
  // and for rewiring links without losing the rest of a node's payload).
  const loadSceneNodes = useCallback(async () => {
    if (!chapterId) return;
    try {
      setSceneNodes(await apiRequest<SceneNodeOut[]>(`/admin/scene-nodes?chapterId=${chapterId}`));
    } catch {
      setSceneNodes([]);
    }
  }, [chapterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the chapter changes
    loadSceneNodes();
  }, [loadSceneNodes]);

  const reload = useCallback(async () => {
    await Promise.all([load(), loadSceneNodes()]);
  }, [load, loadSceneNodes]);

  const say = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((current) => (current === text ? null : current)), 3500);
  };

  const byId = useMemo(() => Object.fromEntries((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);
  const chapterById = useMemo(() => Object.fromEntries((graph?.chapters ?? []).map((c) => [c.id, c])), [graph]);
  const chapter = chapterId ? chapterById[chapterId] : undefined;

  // --- reach: the whole chain a decision leads to / everything an event depends on --------
  const reach = useMemo(() => {
    if (!graph) return { down: {}, up: {} } as { down: Record<string, string[]>; up: Record<string, string[]> };
    const down: Record<string, string[]> = {};
    const up: Record<string, string[]> = {};
    const add = (a: string, b: string) => {
      (down[a] ??= []).push(b);
      (up[b] ??= []).push(a);
    };
    graph.flow.forEach((e) => !e.broken && add(e.from, e.to));
    graph.influences.forEach((i) => add(i.from, i.to));
    // Finishing a chapter leads into the next one.
    const ordered = [...graph.chapters].sort((a, b) => a.order - b.order);
    ordered.forEach((c, i) => {
      const nextEntry = ordered[i + 1]?.entryNodeId;
      if (nextEntry) graph.nodes.filter((n) => n.chapterId === c.id && n.kind === "END").forEach((n) => add(n.id, nextEntry));
    });
    return { down, up };
  }, [graph]);

  const highlighted = useMemo(() => {
    if (!graph || !selected || !mode) return null;
    const seeds = byId[selected] ? [selected] : graph.nodes.filter((n) => n.chapterId === selected).map((n) => n.id);
    const table = mode === "down" ? reach.down : reach.up;
    const seen = new Set(seeds);
    const queue = [...seeds];
    while (queue.length) {
      for (const target of table[queue.shift()!] ?? []) {
        if (!seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
      }
    }
    return seen;
  }, [graph, selected, mode, reach, byId]);

  // --- what is on the canvas -------------------------------------------------------------
  const scene = useMemo(() => {
    if (!graph) return { nodes: [] as Node<CircleData>[], edges: [] as Edge[] };
    const nodes: Node<CircleData>[] = [];
    const edges: Edge[] = [];
    const lit = (id: string) => !highlighted || highlighted.has(id);
    const litChapter = (id: string) => !highlighted || graph.nodes.some((n) => n.chapterId === id && highlighted.has(n.id));
    const at = (key: string, fallback: { x: number; y: number }) => moved[`${view}:${key}`] ?? fallback;

    const flowEdge = (id: string, source: string, target: string, e: Partial<GFlow>, on: boolean, sourceHandle?: string): Edge => ({
      id,
      source,
      target,
      sourceHandle,
      type: "default",
      label: e.label,
      deletable: view === "chapter" && e.kind !== "option",
      style: { stroke: FLOW, strokeWidth: 3, opacity: on ? 1 : 0.1 },
      labelStyle: { fill: MUTED, fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: INK },
      markerEnd: { type: MarkerType.ArrowClosed, color: FLOW, width: 16, height: 16 },
      data: { type: "flow", kind: e.kind },
    });
    const influenceEdge = (id: string, source: string, target: string, label: string, on: boolean): Edge => ({
      id,
      source,
      target,
      type: "default",
      label,
      animated: on,
      deletable: false,
      selectable: false,
      style: { stroke: GOLD, strokeWidth: 2.2, strokeDasharray: "10 8", opacity: on ? 1 : 0.08 },
      labelStyle: { fill: GOLD, fontSize: 11, fontWeight: 600, opacity: on ? 1 : 0 },
      labelBgStyle: { fill: INK, opacity: on ? 1 : 0 },
      markerEnd: { type: MarkerType.ArrowClosed, color: GOLD, width: 14, height: 14 },
      data: { type: "influence" },
    });

    if (view === "chapter") {
      if (!chapter) return { nodes, edges };
      const own = graph.nodes.filter((n) => n.chapterId === chapter.id);
      const ownIds = new Set(own.map((n) => n.id));
      const layout = autoLayout(own, graph.flow, chapter.entryNodeId);
      own.forEach((n) => {
        const outgoing = graph.influences.filter((i) => i.from === n.id && i.crossChapter).length;
        const position = at(n.id, n.x !== null && n.y !== null ? { x: n.x, y: n.y } : layout[n.id]);
        nodes.push({
          id: n.id,
          type: "circle",
          position,
          data: { kind: n.kind, label: n.label, dim: !lit(n.id), selected: selected === n.id, isEntry: n.isEntry, editable: true, badge: n.cost ?? (outgoing ? `⇢ ${outgoing}` : undefined) },
        });
      });
      graph.flow.forEach((e, i) => {
        if (!ownIds.has(e.from)) return;
        if (ownIds.has(e.to)) edges.push(flowEdge(`f${i}`, e.from, e.to, e, lit(e.from) && lit(e.to), e.kind === "then" || e.kind === "else" ? e.kind : undefined));
      });
      // Other chapters this one is tied to appear as dashed "portal" nodes at the edges.
      const portals = new Map<string, { incoming: boolean; x: number }>();
      const xs = nodes.map((n) => n.position.x);
      const minX = Math.min(0, ...xs) - 260;
      const maxX = Math.max(0, ...xs) + 260;
      const portal = (otherChapter: string, incoming: boolean) => {
        const id = `portal:${incoming ? "in" : "out"}:${otherChapter}`;
        if (!portals.has(id)) {
          portals.set(id, { incoming, x: incoming ? minX : maxX });
          const other = chapterById[otherChapter];
          const count = [...portals.values()].filter((p) => p.incoming === incoming).length - 1;
          nodes.push({
            id,
            type: "circle",
            draggable: true,
            position: at(id, { x: incoming ? minX : maxX, y: count * 120 }),
            data: { kind: "PORTAL", label: `${incoming ? "из" : "в"} ${chapterTag(other)} «${other.title.ru}»`, dim: !litChapter(otherChapter), selected: false, editable: false },
          });
        }
        return id;
      };
      const merged = new Map<string, { source: string; target: string; vars: Set<string>; on: boolean }>();
      graph.influences.forEach((inf) => {
        const fromOwn = ownIds.has(inf.from);
        const toOwn = ownIds.has(inf.to);
        if (!fromOwn && !toOwn) return;
        const source = fromOwn ? inf.from : portal(byId[inf.from].chapterId, true);
        const target = toOwn ? inf.to : portal(byId[inf.to].chapterId, false);
        const key = `${source}>${target}`;
        const on = lit(inf.from) && lit(inf.to);
        const entry = merged.get(key) ?? { source, target, vars: new Set<string>(), on: false };
        entry.vars.add(inf.variable);
        entry.on = entry.on || on;
        merged.set(key, entry);
      });
      graph.flow.forEach((e, i) => {
        if (ownIds.has(e.from) && e.crossChapter) edges.push(flowEdge(`x${i}`, e.from, portal(byId[e.to].chapterId, false), e, lit(e.from)));
      });
      merged.forEach((m, key) => edges.push(influenceEdge(`i:${key}`, m.source, m.target, [...m.vars].join(", "), m.on)));
      return { nodes, edges };
    }

    // Season / story: chapters in reading order, each optionally opened to its key nodes.
    const season = chapter?.seasonId;
    const chapters = [...graph.chapters].sort((a, b) => a.order - b.order).filter((c) => view === "story" || c.seasonId === season);
    const proxy: Record<string, string> = {};
    chapters.forEach((c, i) => {
      const open = view === "season" || expanded.has(c.id);
      const x = i * 520;
      nodes.push({
        id: c.id,
        type: "circle",
        position: at(c.id, { x, y: 0 }),
        data: {
          kind: "CHAPTER",
          label: c.title.ru,
          badge: chapterTag(c),
          dim: !litChapter(c.id),
          selected: selected === c.id,
          editable: false,
          canToggle: view === "story",
          open,
          onToggle: () =>
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(c.id)) next.delete(c.id);
              else next.add(c.id);
              return next;
            }),
          current: c.id === chapterId,
        },
      });
      const all = graph.nodes.filter((n) => n.chapterId === c.id);
      all.forEach((n) => (proxy[n.id] = c.id));
      if (open) {
        const keys = all.filter(
          (n) => n.kind === "CONDITION" || n.kind === "EFFECT" || n.kind === "END" || (n.kind === "OPTION" && (n.effects.length > 0 || n.conditions.length > 0)),
        );
        // Decisions (what the player or the script changes) on the left, the events they
        // gate on the right - so consequences read left to right inside a chapter too.
        const rows = { left: 0, right: 0 };
        keys.forEach((n) => {
          proxy[n.id] = n.id;
          const decides = n.kind === "EFFECT" || (n.kind === "OPTION" && n.effects.length > 0 && n.conditions.length === 0);
          const row = decides ? rows.left++ : rows.right++;
          nodes.push({
            id: n.id,
            type: "circle",
            position: at(n.id, { x: x + (decides ? -125 : 125), y: 140 + row * 104 }),
            data: { kind: n.kind, label: n.label, dim: !lit(n.id), selected: selected === n.id, editable: false, badge: n.cost ?? undefined },
          });
          edges.push({ id: `m:${n.id}`, source: c.id, target: n.id, type: "straight", deletable: false, selectable: false, style: { stroke: FLOW, strokeWidth: 1, strokeDasharray: "2 5", opacity: lit(n.id) ? 0.5 : 0.08 } });
        });
      }
      if (i > 0) edges.push(flowEdge(`s:${c.id}`, chapters[i - 1].id, c.id, {}, litChapter(chapters[i - 1].id) && litChapter(c.id)));
    });
    const merged = new Map<string, { source: string; target: string; vars: Set<string>; on: boolean }>();
    graph.influences.forEach((inf) => {
      const source = proxy[inf.from];
      const target = proxy[inf.to];
      if (!source || !target || source === target) return;
      const key = `${source}>${target}`;
      const entry = merged.get(key) ?? { source, target, vars: new Set<string>(), on: false };
      entry.vars.add(inf.variable);
      entry.on = entry.on || (lit(inf.from) && lit(inf.to));
      merged.set(key, entry);
    });
    merged.forEach((m, key) => edges.push(influenceEdge(`i:${key}`, m.source, m.target, [...m.vars].slice(0, 3).join(", "), m.on)));
    return { nodes, edges };
  }, [graph, view, chapter, chapterId, chapterById, byId, expanded, highlighted, selected, moved]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Only positions are ours to keep; selection is driven by clicks below.
      const positions = changes.filter((c) => c.type === "position" && c.position);
      if (positions.length === 0) return;
      const next = applyNodeChanges(positions, scene.nodes);
      setMoved((current) => {
        const copy = { ...current };
        next.forEach((n) => (copy[`${view}:${n.id}`] = n.position));
        return copy;
      });
    },
    [scene.nodes, view],
  );

  const guard = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      await reload();
      if (done) say(done);
    } catch (err) {
      say(err instanceof ApiError ? err.message : "Не удалось сохранить изменение");
    }
  };

  const onNodeDragStop = (_: unknown, node: Node) => {
    if (view !== "chapter" || node.id.startsWith("portal:")) return;
    const target = byId[node.id];
    if (!target) return;
    const body = JSON.stringify({ canvasX: Math.round(node.position.x), canvasY: Math.round(node.position.y) });
    const path = target.kind === "OPTION" ? `/admin/choice-options/${node.id}` : `/admin/scene-nodes/${node.id}`;
    apiRequest(path, { method: "PATCH", body }).catch(() => say("Не удалось сохранить положение узла"));
  };

  const rewire = (source: GNode, handle: string | null | undefined, target: string | null) => {
    if (source.kind === "OPTION") {
      return apiRequest(`/admin/choice-options/${source.id}`, { method: "PATCH", body: JSON.stringify({ nextNodeId: target }) });
    }
    const full = sceneNodes.find((n) => n.id === source.id);
    if (!full) throw new ApiError(0, "Сцена ещё загружается, попробуйте снова");
    const field = source.kind === "CONDITION" ? (handle === "else" ? "elseNodeId" : "thenNodeId") : "nextNodeId";
    return apiRequest(`/admin/scene-nodes/${source.id}`, { method: "PATCH", body: JSON.stringify({ data: { ...full.data, [field]: target } }) });
  };

  const onConnect = (connection: Connection) => {
    const source = byId[connection.source ?? ""];
    const target = byId[connection.target ?? ""];
    if (view !== "chapter" || !source || !target) return;
    if (target.kind === "OPTION") return say("Связь ведёт к сцене, а не к варианту. Варианты принадлежат своему выбору.");
    if (source.kind === "CHOICE") return say("У выбора связи идут от его вариантов — тяните от нужного варианта.");
    if (source.kind === "END") return say("Финал ничем не продолжается.");
    guard(() => rewire(source, connection.sourceHandle, target.id), "Связь сохранена в сценарии");
  };

  const onEdgesDelete = (edges: Edge[]) => {
    edges.forEach((edge) => {
      const source = byId[edge.source];
      if (!source || (edge.data as { type?: string })?.type !== "flow") return;
      guard(() => rewire(source, edge.sourceHandle, null), "Связь удалена из сценария");
    });
  };

  const addNode = (type: SceneNodeOut["type"]) => {
    if (!chapter) return;
    const data = type === "DIALOGUE" ? { text: { ru: "Новая реплика" } } : DEFAULT_DATA_BY_TYPE[type];
    guard(async () => {
      const created = await apiRequest<SceneNodeOut>("/admin/scene-nodes", {
        method: "POST",
        body: JSON.stringify({ type, chapterId: chapter.id, order: sceneNodes.length, data }),
      });
      const xs = scene.nodes.map((n) => n.position.x);
      await apiRequest(`/admin/scene-nodes/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({ canvasX: Math.round(Math.max(0, ...xs) + 220), canvasY: 0 }),
      });
      setSelected(created.id);
      setMode(null);
    }, "Сцена добавлена — откройте её справа, чтобы заполнить");
  };

  const openChapter = (id: string, nodeId: string | null = null) => {
    setChapterId(id);
    setView("chapter");
    setSelected(nodeId);
    setMode(nodeId ? "down" : null);
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!graph) return <p className="text-neutral-500">Загрузка графа…</p>;

  // A long chapter fitted whole would be unreadably small: open on the selected beat and
  // its surroundings, or on the start of the chapter.
  const focus =
    view !== "chapter"
      ? undefined
      : (() => {
          const anchor = selected && byId[selected] ? selected : chapter?.entryNodeId;
          if (!anchor) return undefined;
          const near = new Set([anchor]);
          let frontier = [anchor];
          for (let hop = 0; hop < 3; hop++) {
            frontier = frontier.flatMap((id) => [...(reach.down[id] ?? []), ...(hop < 1 ? (reach.up[id] ?? []) : [])]).filter((id) => byId[id]?.chapterId === chapter?.id && !near.has(id));
            frontier.forEach((id) => near.add(id));
          }
          return [...near].map((id) => ({ id }));
        })();

  const selectedNode = selected ? byId[selected] : undefined;
  const selectedChapter = selected ? chapterById[selected] : undefined;
  const editorNode = selectedNode ? sceneNodes.find((n) => n.id === (selectedNode.kind === "OPTION" ? selectedNode.parentId : selectedNode.id)) : undefined;
  const outgoing = selectedNode ? graph.influences.filter((i) => i.from === selectedNode.id) : [];
  const incoming = selectedNode ? graph.influences.filter((i) => i.to === selectedNode.id) : [];
  const where = (id: string) => {
    const c = chapterById[byId[id].chapterId];
    return `${chapterTag(c)} · ${byId[id].label}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white p-0.5 text-sm">
          {(
            [
              ["chapter", "Граф серии"],
              ["season", "Граф сезона"],
              ["story", "Вся история"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setView(id);
                if (id === "chapter" && selected && !byId[selected]) setSelected(null);
              }}
              aria-pressed={view === id}
              className={`rounded-full px-4 py-1.5 ${view === id ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Серия"
          value={chapterId ?? ""}
          onChange={(e) => {
            setChapterId(e.target.value);
            if (view === "chapter") {
              setSelected(null);
              setMode(null);
            }
          }}
          className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm"
        >
          {[...graph.chapters]
            .sort((a, b) => a.order - b.order)
            .map((c) => (
              <option key={c.id} value={c.id}>
                Сезон {c.seasonIndex}, серия {c.index}: {c.title.ru}
              </option>
            ))}
        </select>
        {view === "chapter" && chapter && (
          <>
            <span className="text-xs text-neutral-500">Добавить:</span>
            {(
              [
                ["DIALOGUE", "Реплика"],
                ["CHOICE", "Выбор"],
                ["CONDITION", "Условие"],
                ["EFFECT", "Эффект"],
                ["END", "Финал"],
              ] as const
            ).map(([type, label]) => (
              <button key={type} onClick={() => addNode(type)} className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs">
                + {label}
              </button>
            ))}
            <Link href={`/stories/${storyId}/chapters/${chapter.id}`} className="ml-auto text-sm text-neutral-600 underline">
              Открыть серию списком
            </Link>
          </>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative overflow-hidden rounded-xl border border-neutral-800" style={{ height: "calc(100vh - 210px)", minHeight: 460, background: `radial-gradient(70% 60% at 50% 40%, #2a2019 0%, ${INK} 75%)` }}>
          <ReactFlow
            key={`${view}:${view === "chapter" ? chapterId : view === "season" ? chapter?.seasonId : "all"}`}
            nodes={scene.nodes}
            edges={scene.edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            onNodeClick={(_, node) => {
              if (node.id.startsWith("portal:")) return;
              setSelected(node.id);
              setConfirmDelete(false);
              setMode((current) => current ?? "down");
              if (chapterById[node.id]) setChapterId(node.id);
            }}
            onNodeDoubleClick={(_, node) => {
              if (chapterById[node.id]) openChapter(node.id);
              else if (node.id.startsWith("portal:")) openChapter(node.id.split(":")[2]);
              else if (view !== "chapter" && byId[node.id]) openChapter(byId[node.id].chapterId, node.id);
            }}
            onPaneClick={() => {
              setSelected(null);
              setMode(null);
            }}
            nodesConnectable={view === "chapter"}
            deleteKeyCode={view === "chapter" ? ["Backspace", "Delete"] : null}
            fitView
            fitViewOptions={{ padding: 0.2, minZoom: view === "chapter" ? 0.6 : 0.3, nodes: focus }}
            style={{ background: "transparent" }}
            minZoom={0.15}
            maxZoom={2}
            colorMode="dark"
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#3a3128" bgColor="transparent" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable maskColor="rgba(13,11,9,.75)" nodeColor={(n) => KIND_LOOK[(n.data as CircleData).kind].ring} style={{ background: "#14100d" }} />
          </ReactFlow>
          <div className="pointer-events-none absolute bottom-3 left-14 flex flex-wrap gap-x-4 gap-y-1 rounded-lg px-3 py-1.5 text-xs" style={{ background: "rgba(20,16,13,.82)", color: MUTED }}>
            <span>
              <i style={{ display: "inline-block", width: 26, borderTop: `3px solid ${FLOW}`, verticalAlign: "middle", marginRight: 6 }} />
              прямой переход к сцене
            </span>
            <span>
              <i style={{ display: "inline-block", width: 26, borderTop: `2px dashed ${GOLD}`, verticalAlign: "middle", marginRight: 6 }} />
              отложенное последствие (характеристика или флаг)
            </span>
          </div>
          {notice && (
            <div className="absolute right-3 top-3 max-w-xs rounded-lg px-3 py-2 text-xs font-medium" style={{ background: GOLD, color: INK }} role="status">
              {notice}
            </div>
          )}
          {graph.truncated && (
            <div className="absolute left-3 top-3 rounded-lg bg-amber-100 px-3 py-1.5 text-xs text-amber-900">Связей очень много — показаны не все отложенные последствия.</div>
          )}
        </div>

        <aside className="min-w-0 space-y-3 self-start rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          {!selectedNode && !selectedChapter && (
            <>
              <h2 className="text-base font-semibold">{view === "chapter" ? `${chapter ? chapterTag(chapter) : ""} ${chapter?.title.ru ?? ""}` : graph.title.ru}</h2>
              <ul className="list-disc space-y-1 pl-5 text-neutral-600">
                <li>Нажмите на узел — увидите его условия и всю цепочку последствий.</li>
                <li>Перетаскивайте узлы и поле, колесом меняйте масштаб.</li>
                {view === "chapter" ? (
                  <>
                    <li>Потяните от кружка-порта справа от узла к другой сцене — связь сразу сохранится в сценарий.</li>
                    <li>Выделите связь и нажмите Delete, чтобы убрать её.</li>
                    <li>Пунктирные узлы по краям — другие серии, с которыми эта связана. Двойной щелчок открывает их.</li>
                  </>
                ) : (
                  <>
                    <li>Двойной щелчок по серии или узлу открывает граф этой серии.</li>
                    {view === "story" && <li>Кнопка + на серии раскрывает её решения и условия.</li>}
                  </>
                )}
              </ul>
            </>
          )}

          {selectedChapter && (
            <>
              <p className="text-xs text-neutral-500">Серия · {selectedChapter.status === "PUBLISHED" ? "опубликована" : "черновик"}</p>
              <h2 className="text-base font-semibold">
                {chapterTag(selectedChapter)} {selectedChapter.title.ru}
              </h2>
              <p className="text-neutral-600">Сцен: {selectedChapter.nodeCount}</p>
              <ModeButtons mode={mode} setMode={setMode} clear={() => setSelected(null)} />
              <button onClick={() => openChapter(selectedChapter.id)} className="w-full rounded bg-neutral-900 px-3 py-2 text-white">
                Открыть граф этой серии
              </button>
            </>
          )}

          {selectedNode && (
            <>
              <p className="text-xs text-neutral-500">
                {KIND_LOOK[selectedNode.kind].name} · {chapterTag(chapterById[selectedNode.chapterId])} «{chapterById[selectedNode.chapterId].title.ru}»
              </p>
              <h2 className="text-base font-semibold">{selectedNode.label || "Без текста"}</h2>
              {selectedNode.cost && <p className="text-amber-700">Платный вариант: {selectedNode.cost}</p>}
              {selectedNode.conditions.length > 0 && <Facts title={selectedNode.kind === "OPTION" ? "Виден, если" : "Условие перехода"} items={selectedNode.conditions} />}
              {selectedNode.effects.length > 0 && <Facts title="Что меняет" items={selectedNode.effects} />}
              {outgoing.length > 0 && (
                <Jumps title="Отложенные последствия" items={outgoing.map((i) => ({ id: i.to, text: `${where(i.to)} (${i.variable})` }))} onJump={(id) => openChapter(byId[id].chapterId, id)} />
              )}
              {incoming.length > 0 && (
                <Jumps title="Зависит от решений" items={incoming.map((i) => ({ id: i.from, text: `${where(i.from)} (${i.variable})` }))} onJump={(id) => openChapter(byId[id].chapterId, id)} />
              )}
              <ModeButtons mode={mode} setMode={setMode} clear={() => setSelected(null)} />

              {view !== "chapter" && (
                <button onClick={() => openChapter(selectedNode.chapterId, selectedNode.id)} className="w-full rounded bg-neutral-900 px-3 py-2 text-white">
                  Открыть в графе серии
                </button>
              )}
              {view === "chapter" && selectedNode.kind !== "OPTION" && (
                <div className="flex flex-wrap gap-3 text-xs">
                  <Link href={previewHref(storyId, selectedNode.chapterId, selectedNode.id)} className="underline">
                    Превью отсюда
                  </Link>
                  {!selectedNode.isEntry && (
                    <button
                      className="underline"
                      onClick={() => guard(() => apiRequest(`/admin/chapters/${selectedNode.chapterId}`, { method: "PATCH", body: JSON.stringify({ entryNodeId: selectedNode.id }) }), "Начальная сцена изменена")}
                    >
                      Сделать начальной
                    </button>
                  )}
                  {confirmDelete ? (
                    <span className="text-red-600">
                      Удалить сцену?{" "}
                      <button
                        className="font-semibold underline"
                        onClick={() => {
                          setConfirmDelete(false);
                          setSelected(null);
                          guard(() => apiRequest(`/admin/scene-nodes/${selectedNode.id}`, { method: "DELETE" }), "Сцена удалена");
                        }}
                      >
                        Да
                      </button>{" "}
                      <button className="underline" onClick={() => setConfirmDelete(false)}>
                        Нет
                      </button>
                    </span>
                  ) : (
                    <button className="text-red-600 underline" onClick={() => setConfirmDelete(true)}>
                      Удалить
                    </button>
                  )}
                </div>
              )}
              {view === "chapter" && editorNode && (
                <div className="border-t border-neutral-200 pt-3">
                  <p className="mb-2 text-xs font-medium text-neutral-600">
                    {selectedNode.kind === "OPTION" ? "Редактирование выбора и его вариантов" : "Редактирование сцены"}
                  </p>
                  <NodeEditorPanel key={editorNode.id + JSON.stringify(editorNode.data).length} node={editorNode} allNodes={sceneNodes} characters={characters} onSaved={reload} />
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function ModeButtons({ mode, setMode, clear }: { mode: Mode; setMode: (mode: Mode) => void; clear: () => void }) {
  const item = (value: Exclude<Mode, null>, label: string) => (
    <button
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`w-full rounded border px-3 py-2 text-left ${mode === value ? "border-amber-600 bg-amber-50 text-amber-900" : "border-neutral-300"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-1.5">
      {item("down", "Показать всю цепочку последствий")}
      {item("up", "Показать, что на это влияет")}
      <button
        onClick={() => {
          setMode(null);
          clear();
        }}
        className="w-full rounded border border-neutral-300 px-3 py-2 text-left text-neutral-600"
      >
        Снять выделение
      </button>
    </div>
  );
}

function Facts({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{title}</p>
      <ul className="list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Jumps({ title, items, onJump }: { title: string; items: { id: string; text: string }[]; onJump: (id: string) => void }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{title}</p>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={`${item.id}-${index}`}>
            <button onClick={() => onJump(item.id)} className="text-left underline decoration-dotted">
              {item.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

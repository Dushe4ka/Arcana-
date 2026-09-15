"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { apiRequest, ApiError } from "@/lib/api";
import { previewHref } from "@/lib/preview";
import { NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";
import type { ChapterOut, CharacterOut, SceneNodeOut } from "@/lib/types";
import { NodeEditorPanel } from "@/components/NodeEditorPanel";
import { QuickAddToolbar } from "@/components/QuickAddToolbar";
import { SceneGraphView } from "@/components/SceneGraphView";

export default function SceneEditorPage() {
  const { id: storyId, chapterId } = useParams<{ id: string; chapterId: string }>();
  const [chapter, setChapter] = useState<ChapterOut | null>(null);
  const [nodes, setNodes] = useState<SceneNodeOut[]>([]);
  const [characters, setCharacters] = useState<CharacterOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "graph">("list");

  const load = async () => {
    try {
      const [chapterData, nodesData, charactersData] = await Promise.all([
        apiRequest<ChapterOut>(`/admin/chapters/${chapterId}`),
        apiRequest<SceneNodeOut[]>(`/admin/scene-nodes?chapterId=${chapterId}`),
        apiRequest<CharacterOut[]>(`/admin/characters?storyId=${storyId}`),
      ]);
      setChapter(chapterData);
      setNodes(nodesData);
      setCharacters(charactersData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить главу");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; rule flags React's own canonical pattern regardless of await timing
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const [mutationError, setMutationError] = useState<string | null>(null);
  // Guards against the stale-closure race on rapid QuickAddToolbar clicks: without this, two
  // clicks fired before the first's create+patch round-trip resolves would both read the same
  // `nodes` snapshot (same `previousLastNode`, same `order: nodes.length`), and the second
  // click's PATCH would overwrite the first's `nextNodeId` write, orphaning one new node from
  // the chain. Also doubles as in-flight feedback (toolbar buttons disable while true).
  const [isAddingDialogue, setIsAddingDialogue] = useState(false);

  const onCreateNode = async (type: SceneNodeOut["type"]) => {
    const defaultDataByType: Record<SceneNodeOut["type"], object> = {
      DIALOGUE: { text: { ru: "…" } },
      CHOICE: {},
      CONDITION: { when: [] },
      EFFECT: { effects: [] },
      END: {},
    };
    try {
      await apiRequest("/admin/scene-nodes", {
        method: "POST",
        body: JSON.stringify({
          type,
          chapterId,
          order: nodes.length,
          data: defaultDataByType[type],
        }),
      });
      load();
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Не удалось создать узел");
    }
  };

  const onDeleteNode = async (nodeId: string) => {
    if (!confirm("Удалить узел? Это необратимо.")) return;
    try {
      await apiRequest(`/admin/scene-nodes/${nodeId}`, { method: "DELETE" });
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      load();
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Не удалось удалить узел");
    }
  };

  const onSetEntryNode = async (nodeId: string) => {
    try {
      await apiRequest(`/admin/chapters/${chapterId}`, {
        method: "PATCH",
        body: JSON.stringify({ entryNodeId: nodeId }),
      });
      load();
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Не удалось задать начальную сцену");
    }
  };

  // One-click, auto-chained dialogue creation for the sticky QuickAddToolbar. `nextNodeId`
  // lives on a node's OWN `data` and points FORWARD (see DialogueNodeData in
  // apps/api/app/schemas/content.py) - so "chaining" the new node after the chapter's current
  // last node means PATCHing that PREVIOUS node's `data.nextNodeId`, not the new node's.
  const onAddDialogue = async (characterId: string | null) => {
    if (isAddingDialogue) return;
    setIsAddingDialogue(true);
    try {
      const sortedNodes = nodes.slice().sort((a, b) => a.order - b.order);
      const previousLastNode = sortedNodes.length > 0 ? sortedNodes[sortedNodes.length - 1] : null;

      const character = characterId ? characters.find((c) => c.id === characterId) ?? null : null;
      const staged = character
        ? [
            {
              characterId: character.id,
              sprite: Object.keys(character.sprites)[0] ?? "neutral",
              position: character.isProtagonist ? "left" : "right",
            },
          ]
        : [];

      let newNode: SceneNodeOut;
      try {
        newNode = await apiRequest<SceneNodeOut>("/admin/scene-nodes", {
          method: "POST",
          body: JSON.stringify({
            type: "DIALOGUE",
            chapterId,
            order: nodes.length,
            data: {
              speakerCharacterId: characterId,
              text: { ru: "…" },
              staged,
            },
          }),
        });
      } catch (err) {
        // POST itself failed - nothing was created, so there's nothing to reload or select.
        setMutationError(err instanceof ApiError ? err.message : "Не удалось добавить реплику");
        return;
      }

      try {
        if (previousLastNode) {
          // Re-send the previous node's full existing `data`, only changing `nextNodeId` -
          // matches the full-object-resend convention used by every other save path in this
          // codebase (e.g. EffectForm/DialogueForm in NodeEditorPanel.tsx).
          await apiRequest(`/admin/scene-nodes/${previousLastNode.id}`, {
            method: "PATCH",
            body: JSON.stringify({ data: { ...previousLastNode.data, nextNodeId: newNode.id } }),
          });
        }
        setMutationError(null);
      } catch (err) {
        // The new node was already created and exists in the backend even though the PATCH
        // that would have chained it into the dialogue flow failed - it's just not linked from
        // `previousLastNode.nextNodeId` yet. Fall through to `load()` below (instead of
        // returning here) so the scenarist can actually see the stray node in the list and fix
        // the chain by hand, rather than it silently existing off-screen. Unlike the POST
        // failure above, this branch always shows the same actionable hint regardless of the
        // underlying error - almost every real failure here comes back as an `ApiError` (either
        // apiRequest's own generic "не удалось подключиться" for a network error, or a
        // server-provided message), and neither of those tells the scenarist that a node now
        // exists unlinked, which is the one thing that actually matters here.
        const reason = err instanceof ApiError ? err.message : null;
        setMutationError(
          "Не удалось связать реплику со следующей — узел создан, проверьте порядок вручную" +
            (reason ? ` (${reason})` : ""),
        );
      }

      await load();
      setSelectedNodeId(newNode.id);
    } finally {
      setIsAddingDialogue(false);
    }
  };

  const onNewCharacter = () => {
    load();
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!chapter) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Глава {chapter.index}: {chapter.title.ru}
          </h1>
          <p className="text-sm text-neutral-500">
            {chapter.status}
            {!chapter.entryNodeId && " · начальная сцена не задана"}
          </p>
        </div>
        {chapter.entryNodeId ? (
          <Link
            href={previewHref(storyId, chapterId)}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          >
            ▶ Превью
          </Link>
        ) : (
          <span
            title="Сначала задайте начальную сцену"
            className="cursor-not-allowed rounded border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400"
          >
            ▶ Превью
          </span>
        )}
      </div>

      {mutationError && <p className="text-sm text-red-600">{mutationError}</p>}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(NODE_TYPE_LABELS) as SceneNodeOut["type"][]).map((type) => (
          <button
            key={type}
            onClick={() => onCreateNode(type)}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          >
            + {NODE_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <QuickAddToolbar
        storyId={storyId}
        characters={characters}
        onAddDialogue={onAddDialogue}
        onNewCharacter={onNewCharacter}
        disabled={isAddingDialogue}
      />

      <div className="flex gap-2 text-sm">
        <button
          onClick={() => setView("list")}
          className={view === "list" ? "font-semibold underline" : "text-neutral-600"}
        >
          Список
        </button>
        <button
          onClick={() => setView("graph")}
          className={view === "graph" ? "font-semibold underline" : "text-neutral-600"}
        >
          Граф
        </button>
      </div>

      {view === "list" && (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
          {nodes
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((node) => (
              <li key={node.id}>
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => setSelectedNodeId(selectedNodeId === node.id ? null : node.id)}
                    className="flex-1 text-left"
                  >
                    <span className="mr-2 rounded bg-neutral-100 px-2 py-0.5 text-xs">
                      {NODE_TYPE_LABELS[node.type]}
                    </span>
                    <span className="text-sm">{nodeSummary(node)}</span>
                    {chapter.entryNodeId === node.id && (
                      <span className="ml-2 text-xs text-green-700">начальная сцена</span>
                    )}
                  </button>
                  <div className="flex gap-3 text-xs">
                    <Link
                      href={previewHref(storyId, chapterId, node.id)}
                      className="text-neutral-600 underline"
                    >
                      Превью отсюда
                    </Link>
                    {chapter.entryNodeId !== node.id && (
                      <button onClick={() => onSetEntryNode(node.id)} className="text-neutral-600 underline">
                        Сделать начальной
                      </button>
                    )}
                    <button onClick={() => onDeleteNode(node.id)} className="text-red-600 underline">
                      Удалить
                    </button>
                  </div>
                </div>
                {selectedNodeId === node.id && (
                  <div className="border-t border-neutral-100 bg-neutral-50 p-4">
                    <NodeEditorPanel
                      node={node}
                      allNodes={nodes}
                      characters={characters}
                      onSaved={load}
                    />
                  </div>
                )}
              </li>
            ))}
          {nodes.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">Пока нет узлов</li>}
        </ul>
      )}
      {view === "graph" && (
        <SceneGraphView nodes={nodes} characters={characters} storyId={storyId} chapterId={chapterId} onNodesChanged={load} />
      )}
    </div>
  );
}

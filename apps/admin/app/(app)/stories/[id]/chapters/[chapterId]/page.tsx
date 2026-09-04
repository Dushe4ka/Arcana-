"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { apiRequest, ApiError } from "@/lib/api";
import { NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";
import type { ChapterOut, CharacterOut, SceneNodeOut } from "@/lib/types";
import { NodeEditorPanel } from "@/components/NodeEditorPanel";

export default function SceneEditorPage() {
  const { id: storyId, chapterId } = useParams<{ id: string; chapterId: string }>();
  const [chapter, setChapter] = useState<ChapterOut | null>(null);
  const [nodes, setNodes] = useState<SceneNodeOut[]>([]);
  const [characters, setCharacters] = useState<CharacterOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!chapter) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Глава {chapter.index}: {chapter.title.ru}
        </h1>
        <p className="text-sm text-neutral-500">
          {chapter.status}
          {!chapter.entryNodeId && " · начальная сцена не задана"}
        </p>
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
    </div>
  );
}

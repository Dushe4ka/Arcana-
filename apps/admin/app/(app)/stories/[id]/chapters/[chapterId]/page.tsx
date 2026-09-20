"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { apiRequest, ApiError } from "@/lib/api";
import { previewHref } from "@/lib/preview";
import { NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";
import type { ChapterOut, CharacterOut, OutfitOut, SceneNodeOut, VariableDefinitionOut } from "@/lib/types";
import { NodeEditorPanel } from "@/components/NodeEditorPanel";
import { QuickAddToolbar } from "@/components/QuickAddToolbar";
import { SceneGraphView } from "@/components/SceneGraphView";

// Task 3's read-side key (`play_service.py`/`preview_service.py` already look this variable up
// as a speaker-name override, falling back to `Character.name`) - this file is the write side:
// the "Переименовать" quick action below is the only place that ever sets it.
const DISPLAY_NAME_OVERRIDE_KEY = "display_name_override";

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
  // the chain. Also doubles as in-flight feedback (toolbar buttons disable while true). Shared
  // by all three quick actions (dialogue/rename/outfit-change) - only one auto-chain round-trip
  // should ever be in flight at a time, since they all read/patch the same `nodes` snapshot.
  //
  // `onRename`/`onChangeOutfit` throw (rather than silently returning) when this guard blocks
  // them, since their popovers `await` the call and unconditionally close on resolution - a
  // silent `return` there would look like a successful no-op to the scenarist. `onAddDialogue`
  // is fired straight from a toolbar button with nothing awaiting its result, so its own early
  // return staying silent is fine.
  const [isQuickActionPending, setIsQuickActionPending] = useState(false);

  // Chains `node` so play continues into `nextNodeId` right after it - the one piece of
  // "auto-chain from the previous last node" logic shared by all three quick actions below.
  // Every node type except CHOICE keeps a single `data.nextNodeId` field, so chaining just means
  // resending its existing `data` with that one field overwritten (the same full-object-resend
  // convention every other save path in this codebase uses, e.g. DialogueForm/EffectForm in
  // NodeEditorPanel.tsx). CHOICE is the one exception: it has no `data.nextNodeId` of its own -
  // each `ChoiceOption` carries its own `nextNodeId` instead (see `ChoiceOptionOut` in
  // lib/types.ts), so "the choice continues here" means patching every one of its options in
  // parallel. Before this helper existed, all three call sites below unconditionally patched
  // `previousLastNode.data.nextNodeId` regardless of type - a silent no-op whenever the previous
  // node was a CHOICE, since `ChoiceNodeData` has no such field for the backend to persist.
  const chainNodeForward = async (node: SceneNodeOut, nextNodeId: string) => {
    if (node.type === "CHOICE") {
      await Promise.all(
        node.choiceOptions.map((option) =>
          apiRequest(`/admin/choice-options/${option.id}`, {
            method: "PATCH",
            body: JSON.stringify({ nextNodeId }),
          }),
        ),
      );
      return;
    }
    await apiRequest(`/admin/scene-nodes/${node.id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { ...node.data, nextNodeId } }),
    });
  };

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
    if (isQuickActionPending) return;
    setIsQuickActionPending(true);
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
          await chainNodeForward(previousLastNode, newNode.id);
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
      setIsQuickActionPending(false);
    }
  };

  // "Переименовать" quick action: sets a per-character `display_name_override` variable via an
  // auto-chained EFFECT node (Task 3 already made play_service/preview_service read this
  // variable back as a speaker-name override). Mirrors `WardrobeMatrix.onAddOutfit`'s
  // check-then-create pattern for the one-time `VariableDefinition`, then Task 8's
  // last-node-lookup + PATCH chaining mechanism for the node itself.
  //
  // Unlike `onAddOutfit`, this always re-fetches `/admin/variables` fresh right before deciding
  // whether to create the definition, rather than trusting a parent-supplied list - the chapter
  // editor page never otherwise loads `VariableDefinition`s, so there's no stale prop to guard
  // against here. `isQuickActionPending` guards the same stale-closure race `onAddDialogue`
  // guards against, since this handler reads/patches the same `nodes` snapshot.
  const onRename = async (characterId: string, newName: string) => {
    // Unlike `onAddDialogue` (fired straight from a toolbar button with no popover awaiting the
    // result), this is awaited by `RenamePopover.onSubmit`, which unconditionally treats a
    // resolved promise as "the action happened" and closes itself. A silent `return` here would
    // let that popover close as if a node had been created while another quick action (Rename or
    // Change Outfit - both independently toggleable, not mutually exclusive) is still in flight.
    // Throwing instead routes through the popover's own try/catch, which shows the message and
    // keeps the popover open with the scenarist's input intact.
    if (isQuickActionPending) {
      throw new ApiError(0, "Дождитесь завершения предыдущего действия");
    }
    const character = characters.find((c) => c.id === characterId);
    if (!character) throw new ApiError(0, "Персонаж не найден");

    setIsQuickActionPending(true);
    try {
      const sortedNodes = nodes.slice().sort((a, b) => a.order - b.order);
      const previousLastNode = sortedNodes.length > 0 ? sortedNodes[sortedNodes.length - 1] : null;

      let newNode: SceneNodeOut;
      try {
        const existingVariables = await apiRequest<VariableDefinitionOut[]>(
          `/admin/variables?storyId=${storyId}`,
        );
        const hasVariable = existingVariables.some(
          (v) => v.key === DISPLAY_NAME_OVERRIDE_KEY && v.characterId === characterId,
        );
        if (!hasVariable) {
          await apiRequest("/admin/variables", {
            method: "POST",
            body: JSON.stringify({
              storyId,
              key: DISPLAY_NAME_OVERRIDE_KEY,
              label: { ru: "Отображаемое имя" },
              type: "STRING",
              defaultValue: character.name.ru,
              characterId,
            }),
          });
        }

        newNode = await apiRequest<SceneNodeOut>("/admin/scene-nodes", {
          method: "POST",
          body: JSON.stringify({
            type: "EFFECT",
            chapterId,
            order: nodes.length,
            data: {
              effects: [{ variableKey: DISPLAY_NAME_OVERRIDE_KEY, characterId, op: "SET", value: newName }],
              nextNodeId: null,
            },
          }),
        });
      } catch (err) {
        // Nothing (or only the VariableDefinition) was created - rethrow so the popover's own
        // catch can keep itself open and show the error, instead of closing on a no-op like a
        // successful submit would.
        setMutationError(err instanceof ApiError ? err.message : "Не удалось переименовать персонажа");
        throw err;
      }

      try {
        if (previousLastNode) {
          await chainNodeForward(previousLastNode, newNode.id);
        }
        setMutationError(null);
      } catch (err) {
        // Same soft-failure shape as `onAddDialogue`: the EFFECT node itself was created, only the
        // chain link failed - so continue to `load()`/select it rather than treating this as a
        // full failure.
        const reason = err instanceof ApiError ? err.message : null;
        setMutationError(
          "Не удалось связать узел переименования со следующим — узел создан, проверьте порядок вручную" +
            (reason ? ` (${reason})` : ""),
        );
      }

      await load();
      setSelectedNodeId(newNode.id);
    } finally {
      setIsQuickActionPending(false);
    }
  };

  // "Смена наряда" quick action: auto-chains a CHOICE node with one option per `Outfit` row a
  // character already has (Task 2/6's wardrobe pricing UI). Always re-fetches the outfit list
  // fresh right before building the node, since the toolbar's own fetch (used only to decide
  // which characters are selectable) can be stale by the time the popover is submitted.
  const onChangeOutfit = async (characterId: string) => {
    // Same reasoning as `onRename`'s guard above: `ChangeOutfitPopover.onSubmit` awaits this and
    // closes unconditionally on resolution, so a blocked call must reject (not silently resolve)
    // or the popover closes as if a CHOICE node were created when nothing happened.
    if (isQuickActionPending) {
      throw new ApiError(0, "Дождитесь завершения предыдущего действия");
    }
    setIsQuickActionPending(true);
    try {
      const sortedNodes = nodes.slice().sort((a, b) => a.order - b.order);
      const previousLastNode = sortedNodes.length > 0 ? sortedNodes[sortedNodes.length - 1] : null;

      let newNode: SceneNodeOut;
      try {
        const outfits = await apiRequest<OutfitOut[]>(`/admin/characters/${characterId}/outfits`);
        if (outfits.length === 0) {
          // Defense in depth - the popover's own select already disables characters with no
          // outfits, so this should be unreachable from the UI, but a stale fetch (outfits
          // deleted between the popover opening and submit) shouldn't silently create an empty
          // CHOICE node.
          throw new ApiError(0, "У этого персонажа пока нет нарядов — добавьте в «Гардеробе»");
        }

        newNode = await apiRequest<SceneNodeOut>("/admin/scene-nodes", {
          method: "POST",
          body: JSON.stringify({
            type: "CHOICE",
            chapterId,
            order: nodes.length,
            data: {},
          }),
        });

        // Options are independent rows (no ordering dependency between them), so they're created
        // in parallel rather than one PATCH-chain-style await per option.
        await Promise.all(
          outfits.map((outfit, index) =>
            apiRequest("/admin/choice-options", {
              method: "POST",
              body: JSON.stringify({
                nodeId: newNode.id,
                text: { ru: outfit.label.ru },
                order: index,
                costCurrency: outfit.priceHard > 0 ? "HARD" : null,
                costAmount: outfit.priceHard,
                effects: [
                  { variableKey: "outfit", characterId, op: "SET", value: outfit.key },
                  ...outfit.statEffects,
                ],
                nextNodeId: null,
              }),
            }),
          ),
        );
      } catch (err) {
        setMutationError(err instanceof ApiError ? err.message : "Не удалось создать узел смены наряда");
        throw err;
      }

      try {
        if (previousLastNode) {
          await chainNodeForward(previousLastNode, newNode.id);
        }
        setMutationError(null);
      } catch (err) {
        const reason = err instanceof ApiError ? err.message : null;
        setMutationError(
          "Не удалось связать узел смены наряда со следующим — узел создан, проверьте порядок вручную" +
            (reason ? ` (${reason})` : ""),
        );
      }

      await load();
      setSelectedNodeId(newNode.id);
    } finally {
      setIsQuickActionPending(false);
    }
  };

  const onNewCharacter = () => {
    load();
  };

  // Defaults the "Переименовать" popover's character select to whoever last spoke in this
  // chapter, when that's easily available - scanning `nodes` for the last DIALOGUE node with a
  // non-null speaker. Recomputed on every render (cheap - chapters rarely have more than a
  // couple hundred nodes) rather than memoized, matching this file's existing style for
  // `sortedNodes`/`previousLastNode` above.
  const sortedNodesForDefaults = nodes.slice().sort((a, b) => a.order - b.order);
  let lastSpeakerCharacterId: string | null = null;
  for (let i = sortedNodesForDefaults.length - 1; i >= 0; i--) {
    const node = sortedNodesForDefaults[i];
    if (node.type === "DIALOGUE") {
      const speakerCharacterId = (node.data as { speakerCharacterId?: string | null }).speakerCharacterId;
      if (speakerCharacterId) {
        lastSpeakerCharacterId = speakerCharacterId;
        break;
      }
    }
  }

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
        onRename={onRename}
        onChangeOutfit={onChangeOutfit}
        lastSpeakerCharacterId={lastSpeakerCharacterId}
        disabled={isQuickActionPending}
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

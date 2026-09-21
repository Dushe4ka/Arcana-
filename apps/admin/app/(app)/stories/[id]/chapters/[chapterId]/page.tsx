"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { apiRequest, ApiError } from "@/lib/api";
import { previewHref } from "@/lib/preview";
import { DEFAULT_DATA_BY_TYPE, NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";
import { derivePoses } from "@/lib/sprites";
import type { ChapterOut, CharacterOut, OutfitOut, SceneNodeOut, VariableDefinitionOut } from "@/lib/types";
import { CharactersSection } from "@/components/CharactersSection";
import { NodeEditorPanel } from "@/components/NodeEditorPanel";
import { QuickAddToolbar } from "@/components/QuickAddToolbar";
import { SceneGraphView } from "@/components/SceneGraphView";
import { VariableReferencesPanel } from "@/components/VariableReferencesPanel";

// Task 3's read-side key (`play_service.py`/`preview_service.py` already look this variable up
// as a speaker-name override, falling back to `Character.name`) - this file is the write side:
// the "Переименовать" quick action below is the only place that ever sets it.
const DISPLAY_NAME_OVERRIDE_KEY = "display_name_override";

export default function SceneEditorPage() {
  const { id: storyId, chapterId } = useParams<{ id: string; chapterId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chapter, setChapter] = useState<ChapterOut | null>(null);
  const [nodes, setNodes] = useState<SceneNodeOut[]>([]);
  const [characters, setCharacters] = useState<CharacterOut[]>([]);
  const [variableDefinitions, setVariableDefinitions] = useState<VariableDefinitionOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "graph" | "characters" | "variables">("list");

  // `?view=graph&node=<id>` on initial load - written by `VariableReferencesPanel`'s "Перейти"
  // for a CROSS-chapter usage (a real navigation to this page), so a scenarist landing here from
  // another chapter's Variables tab sees the right node already selected on the Граф tab.
  // `searchParams` itself never changes after mount on this page (no in-page control edits the
  // URL query string), so this effect only ever needs to run once, on mount - but it's kept
  // keyed on `searchParams` anyway (rather than an empty array) since `useSearchParams` is the
  // one Next.js-recommended way to read it and an exhaustive-deps lint would otherwise flag an
  // empty array as stale.
  useEffect(() => {
    const requestedView = searchParams.get("view");
    const requestedNode = searchParams.get("node");
    if (requestedView === "graph") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time URL->state sync on mount, not a fetch
      setView("graph");
    }
    if (requestedNode) {
      setSelectedNodeId(requestedNode);
    }
  }, [searchParams]);

  // Single "Перейти" entry point handed down to `VariableReferencesPanel` - see that
  // component's own doc comment for why a prop-drilled callback was chosen over a
  // `CustomEvent`. Same-chapter usage: just select+switch tabs locally, no navigation (so
  // `SceneGraphView`'s own `selectedNodeId` effect - see that file - sees a genuinely new
  // externally-set value and re-centers). Cross-chapter usage: a real Next.js navigation to the
  // target chapter's page with `?view=graph&node=` - handled by the effect above once that page
  // mounts.
  const onNavigateToUsage = (targetChapterId: string, nodeId: string) => {
    if (targetChapterId === chapterId) {
      setView("graph");
      setSelectedNodeId(nodeId);
    } else {
      router.push(`/stories/${storyId}/chapters/${targetChapterId}?view=graph&node=${nodeId}`);
    }
  };

  const load = async () => {
    try {
      const [chapterData, nodesData, charactersData, variableDefinitionsData] = await Promise.all([
        apiRequest<ChapterOut>(`/admin/chapters/${chapterId}`),
        apiRequest<SceneNodeOut[]>(`/admin/scene-nodes?chapterId=${chapterId}`),
        apiRequest<CharacterOut[]>(`/admin/characters?storyId=${storyId}`),
        apiRequest<VariableDefinitionOut[]>(`/admin/variables?storyId=${storyId}`),
      ]);
      setChapter(chapterData);
      setNodes(nodesData);
      setCharacters(charactersData);
      setVariableDefinitions(variableDefinitionsData);
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
  // DIALOGUE/EFFECT nodes keep a single `data.nextNodeId` field, so chaining those just means
  // resending their existing `data` with that one field overwritten (the same full-object-resend
  // convention every other save path in this codebase uses, e.g. DialogueForm/EffectForm in
  // NodeEditorPanel.tsx). CHOICE routes forward per-option (handled in the branch below): it has
  // no `data.nextNodeId` of its own - each `ChoiceOption` carries its own `nextNodeId` instead
  // (see `ChoiceOptionOut` in lib/types.ts), so "the choice continues here" means patching every
  // one of its options in parallel, tolerating some PATCHes failing while others succeed (see
  // comment in the branch below). CONDITION/END have no single "next" field either - CONDITION
  // branches via `then`/`else`, END has none at all - but auto-chaining a quick-add onto one of
  // those isn't something this toolbar currently attempts to handle correctly: a known gap,
  // deliberately not addressed by this helper. Before this helper existed, all three call sites
  // below unconditionally patched `previousLastNode.data.nextNodeId` regardless of type - a
  // silent no-op whenever the previous node was CHOICE, CONDITION, or END, since none of those
  // data shapes has such a field for the backend to persist.
  // Returns an informational (non-error) message worth surfacing to the scenarist once chaining
  // succeeds - e.g. some CHOICE options were left untouched because they already had a
  // destination - or `null` when there's nothing to report. A thrown `ApiError` still means the
  // chain itself failed (a PATCH request errored), which is a different, harder failure.
  const chainNodeForward = async (node: SceneNodeOut, nextNodeId: string): Promise<string | null> => {
    if (node.type === "CHOICE") {
      // Only route options that don't already point somewhere - PATCHing every option
      // unconditionally (as this used to) is correct for a freshly-built node (all options start
      // null) but destructive for a CHOICE node with deliberately-authored routing on some or all
      // options: one quick-add click would silently overwrite that with no warning.
      const unroutedOptions = node.choiceOptions.filter((option) => option.nextNodeId == null);
      const alreadyRoutedCount = node.choiceOptions.length - unroutedOptions.length;
      if (unroutedOptions.length === 0) {
        return "Все варианты предыдущего узла уже ведут на другие узлы — новый узел создан, но не подключён к нему автоматически";
      }
      // `Promise.all` would reject as soon as the FIRST option's PATCH failed without waiting for
      // (or cancelling) the rest, which keep running independently - a partial failure could then
      // leave some options linked and others not, with the generic catch below giving no hint of
      // which. `Promise.allSettled` lets every PATCH finish regardless of its siblings, so we can
      // report exactly how many/which options actually failed to link.
      const results = await Promise.allSettled(
        unroutedOptions.map((option) =>
          apiRequest(`/admin/choice-options/${option.id}`, {
            method: "PATCH",
            body: JSON.stringify({ nextNodeId }),
          }),
        ),
      );
      const failedOptions = unroutedOptions.filter((_, index) => results[index].status === "rejected");
      if (failedOptions.length > 0) {
        const labels = failedOptions.map((option) => option.text.ru || "(без текста)").join(", ");
        throw new ApiError(
          0,
          `Не удалось связать ${failedOptions.length} из ${unroutedOptions.length} вариантов со следующим узлом (${labels}) — проверьте порядок вручную`,
        );
      }
      if (alreadyRoutedCount > 0) {
        return `Подключено ${unroutedOptions.length} из ${node.choiceOptions.length} вариантов — остальные ${alreadyRoutedCount} уже вели на другой узел и не были изменены`;
      }
      return null;
    }
    await apiRequest(`/admin/scene-nodes/${node.id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { ...node.data, nextNodeId } }),
    });
    return null;
  };

  // `order: nodes.length` breaks once a node has ever been deleted from the middle of a chapter
  // (no DB-level uniqueness on `(chapter_id, order)`) - two nodes can end up sharing an `order`,
  // which makes the "sort by order, take the last" logic the whole quick-add chaining feature
  // relies on nondeterministic. Always one past the current highest `order`, regardless of gaps
  // left by earlier deletions. Used by the three quick-add handlers below (onAddDialogue/
  // onRename/onChangeOutfit) - `onCreateNode` below keeps its own plain `nodes.length` (out of
  // scope for this fix; nodes created through it are never auto-chained, so a collision there
  // doesn't feed into the chaining logic this exists to protect).
  const nextOrder = (): number => Math.max(-1, ...nodes.map((n) => n.order)) + 1;

  const onCreateNode = async (type: SceneNodeOut["type"]) => {
    try {
      await apiRequest("/admin/scene-nodes", {
        method: "POST",
        body: JSON.stringify({
          type,
          chapterId,
          order: nodes.length,
          data: type === "DIALOGUE" ? { text: { ru: "…" } } : DEFAULT_DATA_BY_TYPE[type],
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
  // last node means updating that PREVIOUS node so it points here, not the new node's own data.
  // What exactly gets updated depends on the previous node's type - see `chainNodeForward` above
  // for the DIALOGUE/EFFECT vs. CHOICE (vs. still-unhandled CONDITION/END) breakdown.
  const onAddDialogue = async (characterId: string | null) => {
    if (isQuickActionPending) return;
    setIsQuickActionPending(true);
    try {
      const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;
      const sortedNodes = nodes.slice().sort((a, b) => a.order - b.order);
      const previousLastNode = selectedNode ?? (sortedNodes.length > 0 ? sortedNodes[sortedNodes.length - 1] : null);

      const character = characterId ? characters.find((c) => c.id === characterId) ?? null : null;
      const staged = character
        ? [
            {
              characterId: character.id,
              // `character.sprites` keys are `${outfit}_${pose}` for a character with outfits
              // (e.g. `dress_neutral`) - the engine treats `staged[].sprite` as the POSE ONLY,
              // composing the real sprite key at read time. A raw `Object.keys(...)[0]` would
              // hard-pin whatever outfit prefix happens to sort first, breaking outfit changes
              // for this line. `derivePoses` (shared with NodeEditorPanel/WardrobeMatrix)
              // strips that prefix down to the bare pose.
              sprite: derivePoses(character.sprites)[0] ?? "neutral",
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
            order: nextOrder(),
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
        const note = previousLastNode ? await chainNodeForward(previousLastNode, newNode.id) : null;
        setMutationError(note);
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
      const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;
      const sortedNodes = nodes.slice().sort((a, b) => a.order - b.order);
      const previousLastNode = selectedNode ?? (sortedNodes.length > 0 ? sortedNodes[sortedNodes.length - 1] : null);

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
              // NOT `character.name.ru` - the read side (`VariableContext.as_value_map()` in
              // variables_service.py) falls back to a definition's `default_value` for ANY
              // player with no stored `PlayerVariableValue` row yet, including ones reading
              // scenes that come BEFORE this rename's EFFECT node in actual playthrough order.
              // Freezing the character's current name in here would make that pre-rename name
              // bleed retroactively into every earlier scene, and would also survive later
              // edits to the character's own display name once frozen. `preview_service.py`/
              // `play_service.py` already guard with `isinstance(override, str) and override`
              // before using the override, so an empty string here correctly reads as "no
              // override active yet, use `Character.name`" - exactly the spec's "до первого
              // переименования — Character.name, после — новое".
              defaultValue: "",
              characterId,
            }),
          });
        }

        newNode = await apiRequest<SceneNodeOut>("/admin/scene-nodes", {
          method: "POST",
          body: JSON.stringify({
            type: "EFFECT",
            chapterId,
            order: nextOrder(),
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
        const note = previousLastNode ? await chainNodeForward(previousLastNode, newNode.id) : null;
        setMutationError(note);
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
      const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;
      const sortedNodes = nodes.slice().sort((a, b) => a.order - b.order);
      const previousLastNode = selectedNode ?? (sortedNodes.length > 0 ? sortedNodes[sortedNodes.length - 1] : null);

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

        // Same check-then-create pattern `onRename` uses for `display_name_override`, and that
        // `WardrobeMatrix.onAddOutfit` already uses for this exact `outfit` variable when it
        // creates the FIRST outfit through that UI. Not every code path that gets a character to
        // having outfits is guaranteed to have gone through that create-first-outfit flow (e.g.
        // legacy sprite-derived outfit columns), so this can't assume the definition already
        // exists - an effect referencing a variable key with no matching definition is silently
        // skipped at read time per this codebase's convention, which would make every option in
        // this CHOICE node a no-op.
        const existingVariables = await apiRequest<VariableDefinitionOut[]>(
          `/admin/variables?storyId=${storyId}`,
        );
        const hasOutfitVariable = existingVariables.some(
          (v) => v.key === "outfit" && v.characterId === characterId,
        );
        if (!hasOutfitVariable) {
          await apiRequest("/admin/variables", {
            method: "POST",
            body: JSON.stringify({
              storyId,
              key: "outfit",
              label: { ru: "Наряд" },
              type: "STRING",
              defaultValue: outfits[0].key,
              characterId,
            }),
          });
        }

        newNode = await apiRequest<SceneNodeOut>("/admin/scene-nodes", {
          method: "POST",
          body: JSON.stringify({
            type: "CHOICE",
            chapterId,
            order: nextOrder(),
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
        const note = previousLastNode ? await chainNodeForward(previousLastNode, newNode.id) : null;
        setMutationError(note);
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
        <button
          onClick={() => setView("characters")}
          className={view === "characters" ? "font-semibold underline" : "text-neutral-600"}
        >
          Персонажи
        </button>
        <button
          onClick={() => setView("variables")}
          className={view === "variables" ? "font-semibold underline" : "text-neutral-600"}
        >
          Переменные
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
        <SceneGraphView
          nodes={nodes}
          characters={characters}
          storyId={storyId}
          chapterId={chapterId}
          entryNodeId={chapter.entryNodeId}
          onNodesChanged={load}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
      )}
      {view === "characters" && (
        <CharactersSection
          storyId={storyId}
          characters={characters}
          variableDefinitions={variableDefinitions}
          onChanged={load}
        />
      )}
      {view === "variables" && (
        <VariableReferencesPanel
          storyId={storyId}
          currentChapterId={chapterId}
          onNavigate={onNavigateToUsage}
        />
      )}
    </div>
  );
}

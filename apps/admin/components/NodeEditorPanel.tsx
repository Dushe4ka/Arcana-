"use client";

import { useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type { ChoiceOptionOut, CharacterOut, SceneNodeOut } from "@/lib/types";
import { EffectRowsEditor, parseValue, type EffectRow } from "./EffectRowsEditor";

function NextNodeSelect({
  value,
  allNodes,
  excludeNodeId,
  onChange,
}: {
  value: string | null;
  allNodes: SceneNodeOut[];
  excludeNodeId: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
    >
      <option value="">(нет продолжения)</option>
      {allNodes
        .filter((n) => n.id !== excludeNodeId)
        .map((n) => (
          <option key={n.id} value={n.id}>
            {n.type} · {n.id.slice(0, 8)}
          </option>
        ))}
    </select>
  );
}

export function NodeEditorPanel({
  node,
  allNodes,
  characters,
  onSaved,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  characters: CharacterOut[];
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (data: object) => {
    setSaving(true);
    try {
      await apiRequest(`/admin/scene-nodes/${node.id}`, { method: "PATCH", body: JSON.stringify({ data }) });
      setError(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить узел");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {node.type === "DIALOGUE" && (
        <DialogueForm node={node} allNodes={allNodes} characters={characters} onSave={save} />
      )}
      {node.type === "CHOICE" && <ChoiceForm node={node} allNodes={allNodes} onSave={save} onOptionsChanged={onSaved} />}
      {node.type === "CONDITION" && <ConditionForm node={node} allNodes={allNodes} onSave={save} />}
      {node.type === "EFFECT" && <EffectForm node={node} allNodes={allNodes} onSave={save} />}
      {node.type === "END" && <EndForm node={node} onSave={save} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saving && <p className="text-sm text-neutral-500">Сохранение…</p>}
    </div>
  );
}

function DialogueForm({
  node,
  allNodes,
  characters,
  onSave,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  characters: CharacterOut[];
  onSave: (data: object) => void;
}) {
  const data = node.data as {
    speakerCharacterId?: string | null;
    text?: { ru?: string };
    isThought?: boolean;
    nextNodeId?: string | null;
  };
  const [speakerCharacterId, setSpeakerCharacterId] = useState<string | null>(data.speakerCharacterId ?? null);
  const [textRu, setTextRu] = useState(data.text?.ru ?? "");
  const [isThought, setIsThought] = useState(Boolean(data.isThought));
  const [nextNodeId, setNextNodeId] = useState<string | null>(data.nextNodeId ?? null);

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-neutral-600">Говорит</label>
        <select
          value={speakerCharacterId ?? ""}
          onChange={(e) => setSpeakerCharacterId(e.target.value || null)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">(рассказчик)</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name.ru}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-600">Текст</label>
        <textarea
          value={textRu}
          onChange={(e) => setTextRu(e.target.value)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          rows={3}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isThought} onChange={(e) => setIsThought(e.target.checked)} />
        Мысли (не речь)
      </label>
      <div>
        <label className="block text-xs text-neutral-600">Следующий узел</label>
        <NextNodeSelect value={nextNodeId} allNodes={allNodes} excludeNodeId={node.id} onChange={setNextNodeId} />
      </div>
      <button
        onClick={() =>
          onSave({
            ...node.data,
            speakerCharacterId,
            text: { ru: textRu },
            isThought,
            nextNodeId,
          })
        }
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
    </div>
  );
}

function ChoiceForm({
  node,
  allNodes,
  onSave,
  onOptionsChanged,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  onSave: (data: object) => void;
  onOptionsChanged: () => void;
}) {
  const data = node.data as { prompt?: { ru?: string } };
  const [promptRu, setPromptRu] = useState(data.prompt?.ru ?? "");
  const [showCreateOption, setShowCreateOption] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-xs text-neutral-600">Подсказка (необязательно)</label>
        <input
          value={promptRu}
          onChange={(e) => setPromptRu(e.target.value)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          onClick={() => onSave(promptRu ? { prompt: { ru: promptRu } } : {})}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          Сохранить
        </button>
      </div>

      <div className="space-y-2 border-t border-neutral-200 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-600">Варианты выбора</span>
          <button onClick={() => setShowCreateOption((v) => !v)} className="text-xs text-neutral-600 underline">
            {showCreateOption ? "Отмена" : "+ Добавить вариант"}
          </button>
        </div>

        {showCreateOption && (
          <ChoiceOptionForm
            nodeId={node.id}
            allNodes={allNodes}
            order={node.choiceOptions.length}
            onSaved={() => {
              setShowCreateOption(false);
              onOptionsChanged();
            }}
          />
        )}

        {node.choiceOptions
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((option) => (
            <ChoiceOptionForm
              key={option.id}
              nodeId={node.id}
              allNodes={allNodes}
              existing={option}
              onSaved={onOptionsChanged}
            />
          ))}
        {node.choiceOptions.length === 0 && !showCreateOption && (
          <p className="text-xs text-neutral-500">Пока нет вариантов</p>
        )}
      </div>
    </div>
  );
}

function ChoiceOptionForm({
  nodeId,
  allNodes,
  existing,
  order,
  onSaved,
}: {
  nodeId: string;
  allNodes: SceneNodeOut[];
  existing?: ChoiceOptionOut;
  order?: number;
  onSaved: () => void;
}) {
  const [textRu, setTextRu] = useState(existing?.text.ru ?? "");
  const [costCurrency, setCostCurrency] = useState<"SOFT" | "HARD" | "">(existing?.costCurrency ?? "");
  const [costAmount, setCostAmount] = useState(existing?.costAmount ?? 0);
  const [nextNodeId, setNextNodeId] = useState<string | null>(existing?.nextNodeId ?? null);
  const [rows, setRows] = useState<EffectRow[]>(
    (existing?.effects ?? []).map((e) => ({
      variableKey: e.variableKey,
      characterId: e.characterId,
      op: e.op,
      value: String(e.value),
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const body = {
      text: { ru: textRu },
      costCurrency: costCurrency || null,
      costAmount,
      nextNodeId,
      effects: rows.map((r) => ({
        variableKey: r.variableKey,
        characterId: r.characterId,
        op: r.op,
        value: parseValue(r.value),
      })),
    };
    try {
      if (existing) {
        await apiRequest(`/admin/choice-options/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiRequest("/admin/choice-options", {
          method: "POST",
          body: JSON.stringify({ nodeId, order, visibleWhen: [], ...body }),
        });
      }
      setError(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить вариант");
    }
  };

  const remove = async () => {
    if (!existing || !confirm("Удалить вариант?")) return;
    try {
      await apiRequest(`/admin/choice-options/${existing.id}`, { method: "DELETE" });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить вариант");
    }
  };

  return (
    <div className="space-y-2 rounded border border-neutral-200 p-2">
      <input
        value={textRu}
        onChange={(e) => setTextRu(e.target.value)}
        placeholder="Текст варианта"
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2 text-sm">
        <select
          value={costCurrency}
          onChange={(e) => setCostCurrency(e.target.value as "SOFT" | "HARD" | "")}
          className="rounded border border-neutral-300 px-2 py-1"
        >
          <option value="">Бесплатно</option>
          <option value="SOFT">Монеты</option>
          <option value="HARD">Кристаллы</option>
        </select>
        {costCurrency && (
          <input
            type="number"
            value={costAmount}
            onChange={(e) => setCostAmount(Number(e.target.value))}
            className="w-20 rounded border border-neutral-300 px-2 py-1"
          />
        )}
      </div>
      <NextNodeSelect value={nextNodeId} allNodes={allNodes} excludeNodeId={nodeId} onChange={setNextNodeId} />
      <EffectRowsEditor rows={rows} onChange={setRows} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} className="rounded bg-neutral-900 px-3 py-1 text-xs text-white">
          Сохранить
        </button>
        {existing && (
          <button onClick={remove} className="text-xs text-red-600 underline">
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionForm({
  node,
  allNodes,
  onSave,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  onSave: (data: object) => void;
}) {
  const data = node.data as {
    when?: Array<{ variableKey: string; characterId: string | null; operator: string; value: unknown }>;
    thenNodeId?: string | null;
    elseNodeId?: string | null;
  };
  const [rows, setRows] = useState<EffectRow[]>(
    (data.when ?? []).map((c) => ({
      variableKey: c.variableKey,
      characterId: c.characterId,
      op: c.operator,
      value: String(c.value),
    })),
  );
  const [thenNodeId, setThenNodeId] = useState<string | null>(data.thenNodeId ?? null);
  const [elseNodeId, setElseNodeId] = useState<string | null>(data.elseNodeId ?? null);

  return (
    <div className="space-y-2">
      <label className="block text-xs text-neutral-600">Условия (все должны выполняться)</label>
      <EffectRowsEditor rows={rows} onChange={setRows} mode="condition" />
      <div>
        <label className="block text-xs text-neutral-600">Если верно</label>
        <NextNodeSelect value={thenNodeId} allNodes={allNodes} excludeNodeId={node.id} onChange={setThenNodeId} />
      </div>
      <div>
        <label className="block text-xs text-neutral-600">Если неверно</label>
        <NextNodeSelect value={elseNodeId} allNodes={allNodes} excludeNodeId={node.id} onChange={setElseNodeId} />
      </div>
      <button
        onClick={() =>
          onSave({
            when: rows.map((r) => ({
              variableKey: r.variableKey,
              characterId: r.characterId,
              operator: r.op,
              value: parseValue(r.value),
            })),
            thenNodeId,
            elseNodeId,
          })
        }
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
    </div>
  );
}

function EffectForm({
  node,
  allNodes,
  onSave,
}: {
  node: SceneNodeOut;
  allNodes: SceneNodeOut[];
  onSave: (data: object) => void;
}) {
  const data = node.data as {
    effects?: Array<{ variableKey: string; characterId: string | null; op: string; value: unknown }>;
    nextNodeId?: string | null;
  };
  const [rows, setRows] = useState<EffectRow[]>(
    (data.effects ?? []).map((e) => ({
      variableKey: e.variableKey,
      characterId: e.characterId,
      op: e.op,
      value: String(e.value),
    })),
  );
  const [nextNodeId, setNextNodeId] = useState<string | null>(data.nextNodeId ?? null);

  return (
    <div className="space-y-2">
      <EffectRowsEditor rows={rows} onChange={setRows} />
      <div>
        <label className="block text-xs text-neutral-600">Следующий узел</label>
        <NextNodeSelect value={nextNodeId} allNodes={allNodes} excludeNodeId={node.id} onChange={setNextNodeId} />
      </div>
      <button
        onClick={() =>
          onSave({
            effects: rows.map((r) => ({
              variableKey: r.variableKey,
              characterId: r.characterId,
              op: r.op,
              value: parseValue(r.value),
            })),
            nextNodeId,
          })
        }
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
    </div>
  );
}

function EndForm({ node, onSave }: { node: SceneNodeOut; onSave: (data: object) => void }) {
  const data = node.data as { unlocksNextChapter?: boolean };
  const [unlocksNextChapter, setUnlocksNextChapter] = useState(data.unlocksNextChapter !== false);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={unlocksNextChapter}
          onChange={(e) => setUnlocksNextChapter(e.target.checked)}
        />
        Открывает следующую главу
      </label>
      <button
        onClick={() => onSave({ unlocksNextChapter })}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
    </div>
  );
}

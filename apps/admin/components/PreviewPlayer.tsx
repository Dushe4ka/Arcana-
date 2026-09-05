"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type {
  CharacterOut,
  PreviewChoiceView,
  PreviewDialogueView,
  PreviewNodeView,
  PreviewStepOut,
  StagedCharacterView,
} from "@/lib/types";

type Snapshot = {
  view: PreviewNodeView;
  backgroundUrl: string | null;
  values: Record<string, number | boolean | string>;
};

export function PreviewPlayer({
  chapterId,
  startNodeId,
  characters,
}: {
  chapterId: string;
  startNodeId: string | null;
  characters: CharacterOut[];
}) {
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

  const current = history.length > 0 ? history[history.length - 1] : null;

  const charactersById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);

  const start = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<PreviewStepOut>(`/admin/preview/chapters/${chapterId}`, {
        method: "POST",
        body: JSON.stringify({ nodeId: startNodeId, backgroundUrl: null, values: {} }),
      });
      setHistory([{ view: data.view, backgroundUrl: data.backgroundUrl, values: data.values }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить превью");
    } finally {
      setBusy(false);
    }
  }, [chapterId, startNodeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; rule flags React's own canonical pattern regardless of await timing
    start();
  }, [start]);

  const advance = async () => {
    if (!current || current.view.type !== "DIALOGUE" || !current.view.canAdvance || busy) return;
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<PreviewStepOut>(`/admin/preview/chapters/${chapterId}`, {
        method: "POST",
        body: JSON.stringify({
          nodeId: current.view.nextNodeId,
          backgroundUrl: current.backgroundUrl,
          values: current.values,
        }),
      });
      setHistory((h) => [...h, { view: data.view, backgroundUrl: data.backgroundUrl, values: data.values }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось перейти дальше");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (choiceOptionId: string) => {
    if (!current || current.view.type !== "CHOICE" || busy) return;
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest<PreviewStepOut>(`/admin/preview/chapters/${chapterId}/choose`, {
        method: "POST",
        body: JSON.stringify({
          nodeId: current.view.nodeId,
          choiceOptionId,
          backgroundUrl: current.backgroundUrl,
          values: current.values,
        }),
      });
      setHistory((h) => [...h, { view: data.view, backgroundUrl: data.backgroundUrl, values: data.values }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось выполнить выбор");
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setError(null);
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  };

  const restart = () => {
    setError(null);
    start();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          onClick={goBack}
          disabled={history.length <= 1 || busy}
          className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-40"
        >
          ← Назад
        </button>
        <button onClick={restart} disabled={busy} className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-40">
          Начать заново
        </button>
        <button
          onClick={() => setShowVariables((v) => !v)}
          className="rounded border border-neutral-300 px-3 py-1"
        >
          {showVariables ? "Скрыть переменные" : "Переменные"}
        </button>
      </div>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {showVariables && current && (
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3">
          {Object.keys(current.values).length === 0 && (
            <p className="text-xs text-neutral-500">Переменных пока нет</p>
          )}
          {Object.entries(current.values).map(([key, value]) => {
            const [variableKey, characterId] = key.split("::");
            const character = characterId ? charactersById.get(characterId) : undefined;
            return (
              <div key={key} className="flex justify-between gap-2 text-xs">
                <span className="text-neutral-600">
                  {variableKey}
                  {character ? ` · ${character.name.ru}` : ""}
                </span>
                <span className="font-mono">{String(value)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mx-auto w-full max-w-[420px]">
        <div
          className="relative overflow-hidden rounded-lg border border-neutral-300 bg-black"
          style={{ aspectRatio: "9 / 19.5" }}
        >
          {current && current.backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded-file URLs, not a static local asset next/image can optimize
            <img src={current.backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/25" />

          {current?.view.type === "DIALOGUE" && (
            <div className="absolute inset-x-0 bottom-[18%] h-[60%]">
              {current.view.staged.map((s) => (
                <StagedSprite key={s.characterId} staged={s} />
              ))}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 p-3">
            {!current && !error && <p className="text-center text-sm text-neutral-300">Загрузка…</p>}
            {current?.view.type === "DIALOGUE" && (
              <DialogueBox view={current.view} onAdvance={advance} busy={busy} />
            )}
            {current?.view.type === "CHOICE" && (
              <ChoicePanel view={current.view} onChoose={choose} busy={busy} />
            )}
            {current?.view.type === "END" && <EndPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}

function StagedSprite({ staged }: { staged: StagedCharacterView }) {
  if (!staged.spriteUrl) return null;
  const posClass =
    staged.position === "left"
      ? "left-0"
      : staged.position === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded-file URLs, not a static local asset next/image can optimize
    <img src={staged.spriteUrl} alt="" className={`absolute bottom-0 h-full w-[34%] object-contain ${posClass}`} />
  );
}

function DialogueBox({
  view,
  onAdvance,
  busy,
}: {
  view: PreviewDialogueView;
  onAdvance: () => void;
  busy: boolean;
}) {
  return (
    <button
      onClick={onAdvance}
      disabled={!view.canAdvance || busy}
      className={`w-full rounded-lg border p-4 text-left ${
        view.isThought ? "border-dashed border-neutral-400" : "border-neutral-300"
      } bg-black/80 disabled:cursor-default`}
    >
      {view.speaker && (
        <p className="mb-1 text-sm font-bold" style={{ color: view.speaker.nameColor }}>
          {view.speaker.name.ru}
        </p>
      )}
      <p className={`text-sm leading-relaxed text-white ${view.isThought ? "italic text-neutral-300" : ""}`}>
        {view.text.ru}
      </p>
      {view.canAdvance && (
        <p className="mt-1 text-right text-xs text-neutral-400">▼ нажмите, чтобы продолжить</p>
      )}
    </button>
  );
}

function ChoicePanel({
  view,
  onChoose,
  busy,
}: {
  view: PreviewChoiceView;
  onChoose: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {view.prompt && <p className="text-center text-sm font-semibold text-white">{view.prompt.ru}</p>}
      {view.options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChoose(option.id)}
          disabled={busy}
          className="flex items-center justify-between rounded-lg border border-white/60 bg-black/70 px-4 py-3 text-left text-sm text-white disabled:opacity-50"
        >
          <span>{option.text.ru}</span>
          {option.costCurrency && (
            <span className="text-xs font-semibold text-amber-300">
              {option.costCurrency === "HARD" ? "💎" : "🪙"} {option.costAmount}
            </span>
          )}
        </button>
      ))}
      {view.options.length === 0 && (
        <p className="text-center text-xs text-neutral-300">
          Нет доступных вариантов при текущих значениях переменных
        </p>
      )}
    </div>
  );
}

function EndPanel() {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-black/80 p-6">
      <p className="text-lg font-bold text-white">Конец главы (превью)</p>
    </div>
  );
}

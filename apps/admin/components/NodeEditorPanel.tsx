"use client";

import { useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import { derivePoses } from "@/lib/sprites";
import type { ChoiceOptionOut, CharacterOut, SceneNodeOut } from "@/lib/types";
import { EffectRowsEditor, parseValue, type EffectRow } from "./EffectRowsEditor";
import { ImageUpload } from "./ImageUpload";

const STAGE_POSITIONS = [
  { value: "left", label: "Слева" },
  { value: "center", label: "По центру" },
  { value: "right", label: "Справа" },
] as const;

type StagePosition = (typeof STAGE_POSITIONS)[number]["value"];

type StagedRow = { characterId: string; sprite: string; position: StagePosition; animation?: string | null };

// Values mirror the Literal types in apps/api/app/schemas/content.py.
const SPRITE_ANIMATIONS = [
  { value: "", label: "без анимации" },
  { value: "fade_in", label: "проявиться" },
  { value: "slide_in", label: "выйти из-за края" },
  { value: "bounce", label: "подпрыгнуть" },
  { value: "shake", label: "вздрогнуть" },
  { value: "nod", label: "кивнуть" },
  { value: "lean_in", label: "податься вперёд" },
];
const ATMOSPHERES = [
  { value: "", label: "не менять" },
  { value: "none", label: "убрать" },
  { value: "rain", label: "дождь" },
  { value: "snow", label: "снег" },
  { value: "fog", label: "туман" },
  { value: "dust", label: "пыль в луче света" },
  { value: "sparkles", label: "золотые искры" },
  { value: "petals", label: "лепестки" },
];
const SCREEN_EFFECTS = [
  { value: "", label: "нет" },
  { value: "shake", label: "тряска" },
  { value: "flash", label: "вспышка" },
  { value: "heartbeat", label: "удар сердца" },
  { value: "blur_in", label: "из расфокуса" },
];
const TRANSITIONS = [
  { value: "", label: "обычная смена реплики" },
  { value: "fade", label: "через затемнение" },
  { value: "dissolve", label: "растворение" },
  { value: "slide", label: "сдвиг" },
];

type MusicCue = { action: "play" | "stop"; url?: string | null; loop?: boolean; volume?: number; fadeMs?: number };
type CameraCue = { zoom: number; focus: StagePosition; durationMs?: number };

function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-neutral-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

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
    backgroundImageUrl?: string | null;
    staged?: StagedRow[];
    nextNodeId?: string | null;
    music?: MusicCue | null;
    sfxUrl?: string | null;
    cgImageUrl?: string | null;
    atmosphere?: string | null;
    camera?: CameraCue | null;
    screenEffect?: string | null;
    transition?: string | null;
  };
  const [music, setMusic] = useState<MusicCue | null>(data.music ?? null);
  const [sfxUrl, setSfxUrl] = useState<string | null>(data.sfxUrl ?? null);
  // undefined/null = keep whatever CG is showing, "" = hide it, url = show this one.
  const [cgImageUrl, setCgImageUrl] = useState<string | null>(data.cgImageUrl ?? null);
  const [atmosphere, setAtmosphere] = useState(data.atmosphere ?? "");
  const [camera, setCamera] = useState<CameraCue | null>(data.camera ?? null);
  const [screenEffect, setScreenEffect] = useState(data.screenEffect ?? "");
  const [transition, setTransition] = useState(data.transition ?? "");
  const hasDirections = Boolean(
    data.music || data.sfxUrl || data.cgImageUrl != null || data.atmosphere || data.camera || data.screenEffect || data.transition,
  );
  const [speakerCharacterId, setSpeakerCharacterId] = useState<string | null>(data.speakerCharacterId ?? null);
  const [textRu, setTextRu] = useState(data.text?.ru ?? "");
  const [isThought, setIsThought] = useState(Boolean(data.isThought));
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(data.backgroundImageUrl ?? null);
  const [staged, setStaged] = useState<StagedRow[]>(data.staged ?? []);
  const [nextNodeId, setNextNodeId] = useState<string | null>(data.nextNodeId ?? null);

  // Seeds the staged list with the speaker exactly once, the first time a speaker is picked
  // while staged is still empty - not on every speaker change, so it never clobbers a staged
  // list the author has already customized (including one they've since emptied out).
  const [stagedSeeded, setStagedSeeded] = useState((data.staged ?? []).length > 0);
  const onSpeakerChange = (value: string | null) => {
    setSpeakerCharacterId(value);
    if (stagedSeeded || !value) return;
    setStagedSeeded(true);
    setStaged((current) => {
      if (current.length > 0) return current;
      const character = characters.find((c) => c.id === value);
      const poses = character ? derivePoses(character.sprites) : [];
      // Same authoring intent as the quick-add toolbar's auto-seed (`onAddDialogue` in the
      // chapter editor page): stage the newly-picked speaker on the side their `isProtagonist`
      // flag implies, instead of always centering them - "center" only when the character
      // somehow isn't found in the list (shouldn't happen since `value` came from this same
      // `characters` array, but keeps the fallback safe rather than crashing on `undefined`).
      const position: StagePosition = character ? (character.isProtagonist ? "left" : "right") : "center";
      return [{ characterId: value, sprite: poses[0] ?? "neutral", position }];
    });
  };

  const updateStagedRow = (index: number, patch: Partial<StagedRow>) => {
    setStaged((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const addStagedRow = () => {
    setStagedSeeded(true);
    const fallback = characters[0];
    const poses = fallback ? derivePoses(fallback.sprites) : [];
    setStaged((rows) => [...rows, { characterId: fallback?.id ?? "", sprite: poses[0] ?? "neutral", position: "center" }]);
  };
  const removeStagedRow = (index: number) => {
    setStagedSeeded(true);
    setStaged((rows) => rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-neutral-600">Говорит</label>
        <select
          value={speakerCharacterId ?? ""}
          onChange={(e) => onSpeakerChange(e.target.value || null)}
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
      <ImageUpload
        label="Фон (необязательно — наследуется от предыдущей реплики)"
        currentUrl={backgroundImageUrl}
        onUploaded={setBackgroundImageUrl}
      />
      {backgroundImageUrl && (
        <button
          type="button"
          onClick={() => setBackgroundImageUrl(null)}
          className="text-xs text-red-600 underline"
        >
          Убрать фон (снова наследовать)
        </button>
      )}
      <div className="space-y-2 border-t border-neutral-200 pt-3">
        <span className="block text-xs font-medium text-neutral-600">Кто на экране</span>
        {staged.map((row, i) => {
          const stagedCharacter = characters.find((c) => c.id === row.characterId);
          const poses = stagedCharacter ? derivePoses(stagedCharacter.sprites) : [];
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 p-2 text-sm">
              <select
                aria-label="Персонаж"
                value={row.characterId}
                onChange={(e) => {
                  const nextCharacter = characters.find((c) => c.id === e.target.value);
                  const nextPoses = nextCharacter ? derivePoses(nextCharacter.sprites) : [];
                  // Reset the pose too - the previous character's pose name may not exist for
                  // the newly selected one, which would otherwise leave the sprite select
                  // holding a value absent from its own options.
                  updateStagedRow(i, { characterId: e.target.value, sprite: nextPoses[0] ?? "neutral" });
                }}
                className="rounded border border-neutral-300 px-2 py-1"
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name.ru}
                  </option>
                ))}
              </select>
              <select
                aria-label="Поза"
                value={row.sprite}
                onChange={(e) => updateStagedRow(i, { sprite: e.target.value })}
                className="rounded border border-neutral-300 px-2 py-1"
              >
                {poses.length === 0 && <option value={row.sprite}>{row.sprite}</option>}
                {poses.map((pose) => (
                  <option key={pose} value={pose}>
                    {pose}
                  </option>
                ))}
              </select>
              <select
                aria-label="Позиция"
                value={row.position}
                onChange={(e) => updateStagedRow(i, { position: e.target.value as StagePosition })}
                className="rounded border border-neutral-300 px-2 py-1"
              >
                {STAGE_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Анимация появления"
                value={row.animation ?? ""}
                onChange={(e) => updateStagedRow(i, { animation: e.target.value || null })}
                className="rounded border border-neutral-300 px-2 py-1"
              >
                {SPRITE_ANIMATIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => removeStagedRow(i)} className="text-red-600 underline">
                Удалить
              </button>
            </div>
          );
        })}
        <button type="button" onClick={addStagedRow} className="text-sm text-neutral-600 underline">
          + Добавить
        </button>
      </div>
      <details className="rounded border border-neutral-200 bg-white p-3" open={hasDirections}>
        <summary className="cursor-pointer text-xs font-medium text-neutral-600">
          Режиссура: музыка, звук, атмосфера, камера
        </summary>
        <p className="mt-2 text-xs text-neutral-500">
          Всё здесь необязательно. Музыка, атмосфера, камера и иллюстрация остаются на экране в следующих
          репликах, пока вы не измените их снова — задавать их нужно только там, где что-то меняется.
        </p>
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <LabeledSelect
              label="Музыка"
              value={music ? music.action : ""}
              options={[
                { value: "", label: "не менять" },
                { value: "play", label: "включить трек" },
                { value: "stop", label: "остановить (плавно затихнет)" },
              ]}
              onChange={(v) => setMusic(v ? { action: v as "play" | "stop", url: music?.url ?? null, loop: true, volume: 1, fadeMs: 800 } : null)}
            />
            {music?.action === "play" && (
              <ImageUpload
                kind="audio"
                label="Трек (MP3, OGG, M4A, WAV)"
                currentUrl={music.url}
                onUploaded={(url) => setMusic({ ...music, url })}
              />
            )}
          </div>
          <div className="space-y-1">
            <ImageUpload kind="audio" label="Звуковой эффект (прозвучит один раз)" currentUrl={sfxUrl} onUploaded={setSfxUrl} />
            {sfxUrl && (
              <button type="button" onClick={() => setSfxUrl(null)} className="text-xs text-red-600 underline">
                Убрать звук
              </button>
            )}
          </div>
          <div className="space-y-1">
            <ImageUpload
              label="Иллюстрация на весь экран (CG) — показывается вместо персонажей"
              currentUrl={cgImageUrl || null}
              onUploaded={setCgImageUrl}
            />
            <div className="flex gap-3 text-xs">
              <button type="button" onClick={() => setCgImageUrl("")} className="text-neutral-600 underline">
                Скрыть иллюстрацию с этой реплики
              </button>
              <button type="button" onClick={() => setCgImageUrl(null)} className="text-neutral-600 underline">
                Не менять
              </button>
              {cgImageUrl === "" && <span className="text-amber-700">с этой реплики иллюстрация будет скрыта</span>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <LabeledSelect label="Атмосфера" value={atmosphere} options={ATMOSPHERES} onChange={setAtmosphere} />
            <LabeledSelect label="Эффект в момент реплики" value={screenEffect} options={SCREEN_EFFECTS} onChange={setScreenEffect} />
            <LabeledSelect label="Переход к реплике" value={transition} options={TRANSITIONS} onChange={setTransition} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <LabeledSelect
              label="Камера"
              value={camera ? "set" : ""}
              options={[
                { value: "", label: "не менять" },
                { value: "set", label: "задать кадр" },
              ]}
              onChange={(v) => setCamera(v ? { zoom: 1.2, focus: "center", durationMs: 900 } : null)}
            />
            {camera && (
              <>
                <label className="block text-xs text-neutral-600">
                  Приближение: {camera.zoom.toFixed(2)}× {camera.zoom === 1 && camera.focus === "center" && "(обычный кадр)"}
                  <input
                    type="range"
                    min={1}
                    max={2}
                    step={0.05}
                    value={camera.zoom}
                    onChange={(e) => setCamera({ ...camera, zoom: Number(e.target.value) })}
                    className="mt-2 w-full"
                  />
                </label>
                <LabeledSelect
                  label="Куда смотрит камера"
                  value={camera.focus}
                  options={STAGE_POSITIONS.map((p) => ({ value: p.value, label: p.label }))}
                  onChange={(v) => setCamera({ ...camera, focus: v as StagePosition })}
                />
              </>
            )}
          </div>
        </div>
      </details>
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
            backgroundImageUrl,
            staged,
            nextNodeId,
            music: music && (music.action === "stop" || music.url) ? music : null,
            sfxUrl,
            cgImageUrl,
            atmosphere: atmosphere || null,
            camera,
            screenEffect: screenEffect || null,
            transition: transition || null,
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
  const data = node.data as { prompt?: { ru?: string }; timerSeconds?: number | null; timeoutOptionId?: string | null };
  const [promptRu, setPromptRu] = useState(data.prompt?.ru ?? "");
  const [timerSeconds, setTimerSeconds] = useState<string>(data.timerSeconds ? String(data.timerSeconds) : "");
  const [timeoutOptionId, setTimeoutOptionId] = useState<string>(data.timeoutOptionId ?? "");
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
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-neutral-600">
            Таймер, сек (пусто — без ограничения времени)
            <input
              type="number"
              min={3}
              max={120}
              value={timerSeconds}
              onChange={(e) => setTimerSeconds(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
            />
          </label>
          {timerSeconds && (
            <label className="block text-xs text-neutral-600">
              Если время вышло, выбирается
              <select
                value={timeoutOptionId}
                onChange={(e) => setTimeoutOptionId(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
              >
                <option value="">(выберите бесплатный вариант без условий)</option>
                {node.choiceOptions
                  .filter((o) => !o.costAmount && o.visibleWhen.length === 0)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.text.ru}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
        <button
          onClick={() =>
            onSave({
              ...(promptRu ? { prompt: { ru: promptRu } } : {}),
              ...(timerSeconds ? { timerSeconds: Number(timerSeconds), timeoutOptionId: timeoutOptionId || null } : {}),
            })
          }
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
  // Advanced disclosure (next-node routing + the full multi-effect editor) starts open
  // whenever the option already carries something that shortcut wouldn't show, so editing
  // an existing option never silently hides configured state.
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(existing?.nextNodeId) ||
      rows.length > 1 ||
      (rows.length === 1 && (rows[0].op !== "INCREMENT" || rows[0].characterId !== null)),
  );

  // The inline shortcut only knows how to represent a single {variableKey, characterId:
  // null, op: "INCREMENT", value} effect - exactly the shape `save()` below already produces
  // from `rows` for that input. Anything richer (more than one effect, a non-INCREMENT op, or
  // an effect scoped to a character) falls back to the untouched `EffectRowsEditor`, so
  // existing data is never silently reinterpreted by the shortcut.
  const singleRow = rows[0];
  const hasComplexEffects =
    rows.length > 1 || (rows.length === 1 && (singleRow.op !== "INCREMENT" || singleRow.characterId !== null));
  const useSimplifiedEffect = !hasComplexEffects;

  const updateSimplifiedEffect = (patch: Partial<Pick<EffectRow, "variableKey" | "value">>) => {
    setRows((current) => {
      const base = current[0] ?? { variableKey: "", characterId: null, op: "INCREMENT", value: "" };
      const next = { ...base, ...patch };
      // Both fields empty means "no effect" - keep `rows` (and therefore the saved
      // `effects` array) empty rather than persisting a blank row.
      return next.variableKey === "" && next.value === "" ? [] : [next];
    });
  };

  const escalateToFullEffects = () => {
    setRows((current) => [
      ...(current.length > 0 ? current : [{ variableKey: "", characterId: null, op: "INCREMENT" as const, value: "" }]),
      { variableKey: "", characterId: null, op: "SET", value: "" },
    ]);
    setAdvancedOpen(true);
  };

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
    <div className="space-y-2 rounded border border-neutral-200 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={textRu}
          onChange={(e) => setTextRu(e.target.value)}
          placeholder="Текст варианта"
          aria-label="Текст варианта"
          className="min-w-[9rem] flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
        />

        {useSimplifiedEffect ? (
          <div className="flex items-center gap-1">
            <input
              value={singleRow?.variableKey ?? ""}
              onChange={(e) => updateSimplifiedEffect({ variableKey: e.target.value })}
              placeholder="ключ"
              aria-label="Ключ переменной"
              title="Ключ переменной (например drama)"
              className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <span className="text-neutral-400" aria-hidden="true">
              +
            </span>
            <input
              type="number"
              value={singleRow?.value ?? ""}
              onChange={(e) => updateSimplifiedEffect({ value: e.target.value })}
              placeholder="0"
              aria-label="На сколько изменить переменную"
              className="w-14 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={escalateToFullEffects}
              title="Добавить ещё один эффект"
              aria-label="Добавить ещё один эффект"
              className="rounded border border-neutral-300 px-2 py-1 text-neutral-600"
            >
              +
            </button>
          </div>
        ) : (
          <span className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600">
            Эффектов: {rows.length}
          </span>
        )}

        <select
          value={costCurrency}
          onChange={(e) => setCostCurrency(e.target.value as "SOFT" | "HARD" | "")}
          aria-label="Цена"
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
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
            aria-label="Сумма цены"
            className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        )}

        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
        >
          {advancedOpen ? "Скрыть доп." : "Доп."}
        </button>
        <button onClick={save} className="rounded bg-neutral-900 px-3 py-1 text-xs text-white">
          Сохранить
        </button>
        {existing && (
          <button onClick={remove} className="text-xs text-red-600 underline">
            Удалить
          </button>
        )}
      </div>

      {advancedOpen && (
        <div className="space-y-2 border-t border-neutral-200 pt-2">
          <div>
            <label className="block text-xs text-neutral-600">Следующий узел</label>
            <NextNodeSelect value={nextNodeId} allNodes={allNodes} excludeNodeId={nodeId} onChange={setNextNodeId} />
          </div>
          {hasComplexEffects && <EffectRowsEditor rows={rows} onChange={setRows} />}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
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
  const data = node.data as {
    unlocksNextChapter?: boolean;
    endingKey?: string | null;
    endingTitle?: { ru?: string } | null;
    rewardSoft?: number;
  };
  const [unlocksNextChapter, setUnlocksNextChapter] = useState(data.unlocksNextChapter !== false);
  const [endingKey, setEndingKey] = useState(data.endingKey ?? "");
  const [endingTitle, setEndingTitle] = useState(data.endingTitle?.ru ?? "");
  const [rewardSoft, setRewardSoft] = useState(String(data.rewardSoft ?? 0));

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
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-xs text-neutral-600">
          Название финала (если их несколько)
          <input
            value={endingTitle}
            onChange={(e) => setEndingTitle(e.target.value)}
            placeholder="Например: «Примирение»"
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
          />
        </label>
        <label className="block text-xs text-neutral-600">
          Ключ финала (латиницей, для коллекции)
          <input
            value={endingKey}
            onChange={(e) => setEndingKey(e.target.value)}
            placeholder="reconciliation"
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
          />
        </label>
        <label className="block text-xs text-neutral-600">
          Награда монетами за первое прохождение
          <input
            type="number"
            min={0}
            value={rewardSoft}
            onChange={(e) => setRewardSoft(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
          />
        </label>
      </div>
      <button
        onClick={() =>
          onSave({
            unlocksNextChapter,
            endingKey: endingKey.trim() || null,
            endingTitle: endingTitle.trim() ? { ru: endingTitle.trim() } : null,
            rewardSoft: Math.max(0, Number(rewardSoft) || 0),
          })
        }
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
      >
        Сохранить
      </button>
    </div>
  );
}

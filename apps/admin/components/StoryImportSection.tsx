"use client";

import { useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type { CharacterOut } from "@/lib/types";

type Issue = { severity: "error" | "warning"; line: number; message: string };
type ChapterRow = {
  season: number;
  index: number;
  title: string;
  target: "new" | "empty" | "blocked";
  counts: { dialogue: number; choice: number; condition: number; effect: number; end: number; options: number };
  issues: Issue[];
  ok: boolean;
};
type Preview = {
  canImport: boolean;
  issues: Issue[];
  chapters: ChapterRow[];
  speakers: { name: string; lines: number; characterId: string | null }[];
  variables: { name: string; character: string | null; exists: boolean; type: string }[];
};
type Result = { createdChapters: number; filledChapters: number; createdNodes: number; createdCharacters: number; createdVariables: number };

const CREATE = "__create__";
const NARRATOR = "__narrator__";
const TYPE_LABEL: Record<string, string> = { NUMBER: "число", BOOLEAN: "флаг да/нет", STRING: "текст" };

export const STORY_TEMPLATE = `Заметки до первой главы в игру не попадают.

# Сезон 1

## Глава 1: Название главы
// Комментарий для команды
Текст рассказчика.
Имя персонажа: Реплика.
Имя персонажа (мысли): Мысль.

? Вопрос выбора
- Первый вариант {доверие(Имя персонажа) +2} -> метка_один
- Второй вариант -> метка_два
- Платный вариант [кристаллы 5] -> метка_один

== метка_один ==
Продолжение первой ветки.
-> общий_финал

== метка_два ==
{смелость +1}
Продолжение второй ветки.
-> общий_финал

== общий_финал ==
[если доверие(Имя персонажа) >= 2] -> тёплый | иначе -> холодный

== тёплый ==
=== КОНЕЦ: Название финала ===

== холодный ==
=== КОНЕЦ: Другой финал ===

## Глава 2: Следующая глава
Текст следующей главы.
=== КОНЕЦ ===
`;

/** Loads a whole story document (seasons, chapters, lines, choices, conditions) and spreads
 * it across draft chapters. Check first, import second; nothing is published. */
export function StoryImportSection({
  storyId,
  characters,
  onImported,
}: {
  storyId: string;
  characters: CharacterOut[];
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [speakers, setSpeakers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const fail = (err: unknown, fallback: string) => setMessage({ kind: "error", text: err instanceof ApiError ? err.message : fallback });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest<{ text: string }>("/admin/import/extract-text", { method: "POST", body: formData, formData: true });
      setText(result.text);
      setPreview(null);
    } catch (err) {
      fail(err, "Не удалось прочитать файл");
    } finally {
      setBusy(false);
    }
  };

  const onCheck = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiRequest<Preview>(`/admin/stories/${storyId}/import/preview`, { method: "POST", body: JSON.stringify({ text }) });
      setPreview(result);
      setSpeakers(Object.fromEntries(result.speakers.map((s) => [s.name, s.characterId ?? CREATE])));
    } catch (err) {
      fail(err, "Не удалось проверить документ");
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await apiRequest<Result>(`/admin/stories/${storyId}/import`, { method: "POST", body: JSON.stringify({ text, speakers }) });
      setMessage({
        kind: "ok",
        text: `Готово: глав создано — ${r.createdChapters}${r.filledChapters ? `, заполнено — ${r.filledChapters}` : ""}, сцен — ${r.createdNodes}, персонажей — ${r.createdCharacters}, характеристик — ${r.createdVariables}. Главы сохранены как черновики.`,
      });
      setText("");
      setPreview(null);
      onImported();
    } catch (err) {
      fail(err, "Не удалось импортировать");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([STORY_TEMPLATE], { type: "text/plain;charset=utf-8" }));
    link.download = "arcana-шаблон-истории.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Документ истории</h2>
        <button onClick={() => setOpen((v) => !v)} className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm">
          {open ? "Свернуть" : "Загрузить документ истории"}
        </button>
      </div>
      {message && (
        <p className={`rounded border px-3 py-2 text-sm ${message.kind === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
      {open && (
        <div className="space-y-4 rounded border border-neutral-200 bg-white p-4 text-sm">
          <p className="text-neutral-600">
            Загрузите документ с заголовками сезонов и глав — реплики, выборы, условия и главы разложатся сами. Главы
            создаются черновиками; готовые и опубликованные главы не затираются. Потом всё можно править в редакторе и на
            графе.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded border border-neutral-300 px-3 py-1.5">
              Выбрать DOCX / TXT / MD
              <input type="file" accept=".docx,.txt,.md,text/plain" onChange={onFile} disabled={busy} className="hidden" />
            </label>
            <button onClick={downloadTemplate} className="underline">
              Скачать шаблон
            </button>
            <button onClick={() => { setText(STORY_TEMPLATE); setPreview(null); }} className="underline">
              Вставить шаблон сюда
            </button>
            <span className="text-xs text-neutral-500">{text ? `${text.split("\n").length} строк` : ""}</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            rows={12}
            spellCheck={false}
            aria-label="Текст документа истории"
            placeholder={"# Сезон 1\n## Глава 1: Название\n…"}
            className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-3">
            <button onClick={onCheck} disabled={busy || !text.trim()} className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-50">
              {busy && !preview ? "Проверяю…" : "Проверить"}
            </button>
            {preview && (
              <button onClick={onImport} disabled={busy || !preview.canImport} className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-40">
                {busy ? "Импортирую…" : `Импортировать глав: ${preview.chapters.length}`}
              </button>
            )}
          </div>

          {preview && (
            <div className="space-y-4">
              {preview.issues.map((issue, i) => (
                <IssueLine key={i} issue={issue} />
              ))}
              <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
                {preview.chapters.map((c) => (
                  <li key={`${c.season}-${c.index}`} className="space-y-1.5 px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-medium">
                        Сезон {c.season}, глава {c.index}: {c.title}
                      </span>
                      <span className={`text-xs ${c.ok ? "text-green-700" : "text-red-600"}`}>
                        {c.target === "new" ? "будет создана" : c.target === "empty" ? "пустой черновик — будет заполнен" : "пропущена"}
                      </span>
                      <span className="text-xs text-neutral-500">
                        реплик {c.counts.dialogue} · выборов {c.counts.choice} · условий {c.counts.condition} · финалов {c.counts.end}
                      </span>
                    </div>
                    {c.issues.map((issue, i) => (
                      <IssueLine key={i} issue={issue} />
                    ))}
                  </li>
                ))}
              </ul>

              {preview.speakers.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-neutral-600">Кто говорит в документе</p>
                  <div className="space-y-2">
                    {preview.speakers.map((speaker) => (
                      <div key={speaker.name} className="flex flex-wrap items-center gap-3">
                        <span className="w-40 truncate font-medium">{speaker.name}</span>
                        <span className="w-20 text-xs text-neutral-500">реплик: {speaker.lines}</span>
                        <select
                          aria-label={`Персонаж для «${speaker.name}»`}
                          value={speakers[speaker.name] ?? CREATE}
                          onChange={(e) => setSpeakers((current) => ({ ...current, [speaker.name]: e.target.value }))}
                          className="rounded border border-neutral-300 px-2 py-1"
                        >
                          <option value={CREATE}>создать нового персонажа «{speaker.name}»</option>
                          <option value={NARRATOR}>не персонаж — оставить текстом рассказчика</option>
                          {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              это {c.name.ru}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.variables.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-600">Характеристики и флаги в документе</p>
                  <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                    {preview.variables.map((v) => (
                      <li key={`${v.name}-${v.character}`}>
                        {v.name}
                        {v.character ? ` (${v.character})` : ""} — {TYPE_LABEL[v.type] ?? v.type}
                        <span className={v.exists ? "text-neutral-500" : "text-amber-700"}>{v.exists ? ", уже есть" : ", будет создана"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function IssueLine({ issue }: { issue: Issue }) {
  return (
    <p className={`rounded border px-3 py-1.5 text-sm ${issue.severity === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
      {issue.line > 0 && <span className="mr-2 font-mono text-xs">строка {issue.line}</span>}
      {issue.message}
    </p>
  );
}

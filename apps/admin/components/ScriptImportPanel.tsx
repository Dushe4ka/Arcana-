"use client";

import { useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type { CharacterOut } from "@/lib/types";

type Issue = { severity: "error" | "warning"; line: number; message: string };
type Speaker = { name: string; lines: number; characterId: string | null };
type Preview = {
  canImport: boolean;
  chapterIsDraft: boolean;
  counts: { dialogue: number; choice: number; end: number; options: number };
  speakers: Speaker[];
  issues: Issue[];
  sample: { line: number; type: string; speaker: string | null; text: string; options: string[]; label: string | null }[];
};

const CREATE = "__create__";
const NARRATOR = "__narrator__";

const EXAMPLE = `@фон: https://…/hall.jpg
Вечер. Зал наполнялся гостями.
Лия (мысли): Он смотрит на меня.
Адриан: Добрый вечер.

? Как ответить?
- Улыбнуться -> тепло
- Пригласить на танец [кристаллы 5] -> танец

== тепло ==
Адриан: Я рад, что вы пришли.
-> финал

== танец ==
Они закружились в танце.

== финал ==
=== КОНЕЦ: Рассвет ===`;

/** Brings a screenplay written as plain text (or a DOCX) into a draft chapter. Always a
 * two-step flow - check, then import - so nothing is created until a person has seen what
 * the parser understood and resolved every speaker. */
export function ScriptImportPanel({
  chapterId,
  characters,
  onImported,
}: {
  chapterId: string;
  characters: CharacterOut[];
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [speakers, setSpeakers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const fail = (err: unknown, fallback: string) =>
    setMessage({ kind: "error", text: err instanceof ApiError ? err.message : fallback });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest<{ text: string }>("/admin/import/extract-text", {
        method: "POST",
        body: formData,
        formData: true,
      });
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
      const result = await apiRequest<Preview>(`/admin/chapters/${chapterId}/import/preview`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setPreview(result);
      setSpeakers(Object.fromEntries(result.speakers.map((s) => [s.name, s.characterId ?? CREATE])));
    } catch (err) {
      fail(err, "Не удалось проверить текст");
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiRequest<{ createdNodes: number; createdCharacters: number }>(
        `/admin/chapters/${chapterId}/import`,
        { method: "POST", body: JSON.stringify({ text, speakers }) },
      );
      setMessage({
        kind: "ok",
        text: `Импортировано сцен: ${result.createdNodes}${
          result.createdCharacters ? `, создано персонажей: ${result.createdCharacters}` : ""
        }. Откройте «Проверку сюжета», прежде чем публиковать.`,
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

  const errors = preview?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = preview?.issues.filter((i) => i.severity === "warning") ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
        <p>
          Вставьте текст главы или загрузите файл. Сначала нажмите «Проверить» — вы увидите, что именно будет создано,
          и только потом импортируете. Импорт возможен только в черновик и ничего не публикует.
        </p>
        <button onClick={() => setShowHelp((v) => !v)} className="mt-2 text-xs underline">
          {showHelp ? "Скрыть пример оформления" : "Как оформить текст"}
        </button>
        {showHelp && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs leading-relaxed">{EXAMPLE}</pre>
            <ul className="space-y-1 text-xs text-neutral-600">
              <li><b>Имя: текст</b> — реплика персонажа. <b>Имя (мысли): текст</b> — мысли.</li>
              <li>Строка без имени — текст рассказчика.</li>
              <li><b>? вопрос</b> и строки <b>- вариант -&gt; метка</b> — выбор. <b>[кристаллы 5]</b> или <b>[монеты 20]</b> — платный вариант.</li>
              <li><b>== метка ==</b> — место, куда можно перейти. <b>-&gt; метка</b> — переход.</li>
              <li><b>=== КОНЕЦ ===</b> или <b>=== КОНЕЦ: Название ===</b> — финал главы.</li>
              <li>Ремарки перед репликой: <b>@фон</b>, <b>@музыка</b> (ссылка или «стоп»), <b>@звук</b>, <b>@cg</b>, <b>@атмосфера</b> (дождь, снег, туман, пыль, искры, лепестки), <b>@эффект</b> (тряска, вспышка, сердце), <b>@переход</b> (затемнение, растворение).</li>
              <li><b>{"{доверие(Адриан) +2}"}</b> — изменить характеристику или флаг (можно прямо в варианте выбора). <b>[если смелость &gt;= 1]</b> в варианте — показывать его только при условии.</li>
              <li><b>[если доверие(Адриан) &gt;= 2] -&gt; метка | иначе -&gt; метка</b> — развилка без выбора игрока.</li>
              <li>Строки с <b>{"//"}</b> — комментарии, в игру не попадают. Полное описание — в файле docs/story-format.md, целую историю удобнее загружать на странице истории.</li>
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="cursor-pointer rounded border border-neutral-300 bg-white px-3 py-1.5">
          Загрузить DOCX / TXT / MD
          <input type="file" accept=".docx,.txt,.md,text/plain" onChange={onFile} disabled={busy} className="hidden" />
        </label>
        <span className="text-xs text-neutral-500">{text ? `${text.split("\n").length} строк` : "или вставьте текст ниже"}</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={14}
        spellCheck={false}
        placeholder="Текст главы…"
        aria-label="Текст сценария"
        className="w-full rounded border border-neutral-300 bg-white px-3 py-2 font-mono text-sm"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onCheck}
          disabled={busy || !text.trim()}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {busy && !preview ? "Проверяю…" : "Проверить"}
        </button>
        {preview && (
          <button
            onClick={onImport}
            disabled={busy || !preview.canImport}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            {busy ? "Импортирую…" : `Импортировать ${preview.counts.dialogue + preview.counts.choice + preview.counts.end} сцен`}
          </button>
        )}
      </div>

      {message && (
        <p className={`rounded border px-3 py-2 text-sm ${message.kind === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}

      {preview && (
        <div className="space-y-4">
          {!preview.chapterIsDraft && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Глава опубликована. Снимите её с публикации или создайте новую главу — импорт идёт только в черновик.
            </p>
          )}
          <p className="text-sm text-neutral-700">
            Будет создано: реплик — {preview.counts.dialogue}, выборов — {preview.counts.choice} (вариантов —{" "}
            {preview.counts.options}), финалов — {preview.counts.end}.
          </p>

          {[...errors, ...warnings].length > 0 && (
            <ul className="space-y-1">
              {[...errors, ...warnings].map((issue, i) => (
                <li
                  key={i}
                  className={`rounded border px-3 py-1.5 text-sm ${issue.severity === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}
                >
                  {issue.line > 0 && <span className="mr-2 font-mono text-xs">строка {issue.line}</span>}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          {preview.speakers.length > 0 && (
            <div className="rounded border border-neutral-200 bg-white p-3">
              <p className="mb-2 text-xs font-medium text-neutral-600">Кто говорит в тексте</p>
              <div className="space-y-2">
                {preview.speakers.map((speaker) => (
                  <div key={speaker.name} className="flex flex-wrap items-center gap-3 text-sm">
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

          <div className="rounded border border-neutral-200 bg-white">
            <p className="border-b border-neutral-100 px-3 py-2 text-xs font-medium text-neutral-600">
              Как это прочитано{preview.sample.length === 40 ? " (первые 40 сцен)" : ""}
            </p>
            <ul className="divide-y divide-neutral-100 text-sm">
              {preview.sample.map((row, i) => (
                <li key={i} className="flex gap-3 px-3 py-1.5">
                  <span className="w-10 shrink-0 font-mono text-xs text-neutral-400">{row.line}</span>
                  <span className="w-20 shrink-0 text-xs text-neutral-500">
                    {row.type === "DIALOGUE" ? (row.speaker ?? "рассказчик") : row.type === "CHOICE" ? "выбор" : "финал"}
                  </span>
                  <span className="min-w-0 flex-1">
                    {row.label && <span className="mr-2 rounded bg-neutral-100 px-1.5 text-xs">{row.label}</span>}
                    {row.text}
                    {row.options.length > 0 && <span className="text-neutral-500"> → {row.options.join(" / ")}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

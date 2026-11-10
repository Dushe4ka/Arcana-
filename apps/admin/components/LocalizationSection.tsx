"use client";

import { useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";

type Unit = { key: string; context: string; source: string; sourceHash: string; translation: string; state: string };
type Export = {
  locale: string;
  summary: { total: number; translated: number; missing: number; stale: number };
  units: Unit[];
};
type ImportResult = { applied: number; unchanged: number; skippedStale: string[]; unknownKeys: string[] };

const LOCALES = [
  { value: "en", label: "Английский" },
  { value: "fr", label: "Французский" },
  { value: "pt-BR", label: "Португальский (Бразилия)" },
];

/** Hand-off to translators: download every string of the story as a file, get it back
 * filled in, upload. Lines whose Russian original changed in between are not overwritten -
 * they are reported so the translator can redo just those. */
export function LocalizationSection({ storyId, slug }: { storyId: string; slug: string }) {
  const [locale, setLocale] = useState("en");
  const [data, setData] = useState<Export | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = async (target = locale) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiRequest<Export>(`/admin/stories/${storyId}/localization?locale=${target}`);
      setData(result);
      return result;
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Не удалось загрузить переводы" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async () => {
    const result = await load();
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${slug}.${locale}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Export>;
      if (!Array.isArray(parsed.units)) throw new SyntaxError("no units");
      const result = await apiRequest<ImportResult>(`/admin/stories/${storyId}/localization`, {
        method: "POST",
        body: JSON.stringify({
          locale: parsed.locale ?? locale,
          units: parsed.units.map((u) => ({ key: u.key, sourceHash: u.sourceHash, translation: u.translation })),
        }),
      });
      const notes = [
        `Обновлено строк: ${result.applied}`,
        result.skippedStale.length
          ? `пропущено ${result.skippedStale.length} — русский текст изменился после выгрузки, скачайте файл заново и переведите их ещё раз`
          : "",
        result.unknownKeys.length ? `не найдено в истории: ${result.unknownKeys.length}` : "",
      ].filter(Boolean);
      setMessage({
        kind: "ok",
        text: `${notes.join("; ")}. Чтобы перевод увидели игроки, опубликуйте правки в затронутых главах.`,
      });
      await load(parsed.locale ?? locale);
    } catch (err) {
      setMessage({
        kind: "error",
        text:
          err instanceof ApiError
            ? err.message
            : "Это не файл перевода: нужен JSON, скачанный отсюда и заполненный переводчиком",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Переводы</h2>
      <div className="space-y-3 rounded border border-neutral-200 bg-white p-4 text-sm">
        <p className="text-neutral-600">
          Скачайте файл со всеми строками истории, отдайте переводчику (он заполняет поле «translation») и загрузите
          обратно.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Язык перевода"
            value={locale}
            onChange={(e) => {
              setLocale(e.target.value);
              setData(null);
            }}
            className="rounded border border-neutral-300 px-2 py-1.5"
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <button onClick={() => load()} disabled={busy} className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-50">
            Показать состояние
          </button>
          <button onClick={onDownload} disabled={busy} className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-50">
            Скачать файл для переводчика
          </button>
          <label className="cursor-pointer rounded bg-neutral-900 px-3 py-1.5 text-white">
            Загрузить перевод
            <input type="file" accept="application/json,.json" onChange={onUpload} disabled={busy} className="hidden" />
          </label>
        </div>
        {data && (
          <p className="text-neutral-700">
            Всего строк: {data.summary.total} · переведено: {data.summary.translated} · не переведено:{" "}
            {data.summary.missing}
            {data.summary.stale > 0 && (
              <span className="text-amber-700"> · устарело (оригинал изменился): {data.summary.stale}</span>
            )}
          </p>
        )}
        {message && (
          <p className={message.kind === "ok" ? "text-green-700" : "text-red-600"}>{message.text}</p>
        )}
      </div>
    </section>
  );
}

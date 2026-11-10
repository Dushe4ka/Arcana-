"use client";

import { useCallback, useEffect, useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";

type Overview = {
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  liveVersion: number | null;
  hasUnpublishedChanges: boolean;
  versions: { version: number; publishedAt: string; nodeCount: number; isLive: boolean }[];
};

/** What players currently see of this chapter versus what is being edited. Players always
 * read a published version; edits made here stay invisible to them until "publish". */
export function PublicationBar({
  chapterId,
  refreshKey,
  onChanged,
  onQaFailed,
}: {
  chapterId: string;
  /** Changes whenever the chapter's nodes were edited, so the bar re-checks for drift. */
  refreshKey: unknown;
  onChanged: () => void;
  onQaFailed: () => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await apiRequest<Overview>(`/admin/chapters/${chapterId}/publications`));
    } catch {
      // Purely informational: the editor works without it.
    }
  }, [chapterId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / after edits
    load();
  }, [load, refreshKey]);

  const run = async (path: string, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/chapters/${chapterId}/${path}`, { method: "POST" });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
      if (err instanceof ApiError && err.message.startsWith("Главу нельзя опубликовать")) onQaFailed();
    } finally {
      setBusy(false);
    }
  };

  if (!overview) return null;
  const live = overview.status === "PUBLISHED" && overview.liveVersion !== null;

  return (
    <div className="rounded border border-neutral-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${live ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-700"}`}>
          {live ? `Игроки видят версию ${overview.liveVersion}` : "Не опубликована — игроки её не видят"}
        </span>
        {live && overview.hasUnpublishedChanges && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Есть правки, которых игроки ещё не видят
          </span>
        )}
        <span className="flex-1" />
        {(!live || overview.hasUnpublishedChanges) && (
          <button
            onClick={() => run("publish", "Не удалось опубликовать")}
            disabled={busy}
            className="rounded bg-neutral-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {busy ? "Публикую…" : live ? "Опубликовать правки" : "Опубликовать"}
          </button>
        )}
        {live && (
          <button
            onClick={() => {
              if (confirm("Снять главу с публикации? Игроки перестанут её видеть.")) run("unpublish", "Не удалось снять с публикации");
            }}
            disabled={busy}
            className="text-xs text-neutral-600 underline disabled:opacity-50"
          >
            Снять с публикации
          </button>
        )}
        {overview.versions.length > 0 && (
          <button onClick={() => setShowVersions((v) => !v)} className="text-xs text-neutral-600 underline">
            {showVersions ? "Скрыть версии" : `Версии (${overview.versions.length})`}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {showVersions && (
        <ul className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100">
          {overview.versions.map((v) => (
            <li key={v.version} className="flex items-center gap-3 py-1.5 text-xs">
              <span className="w-20 font-medium">Версия {v.version}</span>
              <span className="w-40 text-neutral-500">{new Date(v.publishedAt).toLocaleString("ru-RU")}</span>
              <span className="text-neutral-500">сцен: {v.nodeCount}</span>
              <span className="flex-1" />
              {v.isLive ? (
                <span className="text-green-700">сейчас у игроков</span>
              ) : (
                <button
                  onClick={() => {
                    if (confirm(`Вернуть игрокам версию ${v.version}? Ваш черновик при этом не изменится.`)) {
                      run(`publications/${v.version}/activate`, "Не удалось вернуть версию");
                    }
                  }}
                  disabled={busy}
                  className="underline disabled:opacity-50"
                >
                  Вернуть эту версию
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import { NODE_TYPE_LABELS } from "@/lib/scene-nodes";
import type { VariableUsageOut } from "@/lib/types";

/**
 * "Переменные" tab: for every `VariableDefinition` in the story, lists every place it's set
 * (`role: "sets"`) or checked (`role: "reads"`) across every season/chapter, consuming Task 1's
 * `GET /admin/stories/{storyId}/variable-usages`.
 *
 * "Перейти" navigation is a single `onNavigate` callback prop-drilled down from `page.tsx`
 * rather than a `window.dispatchEvent`/`CustomEvent` pair (the plan's own brief explicitly
 * allowed either) - one callback that already knows both "which chapter" and "which node" lets
 * the parent decide same-chapter (just select+center, no navigation) vs. cross-chapter (a real
 * page navigation) in one place, with no DOM-global indirection and no `Link`-to-the-same-URL
 * dead end (a `Link` whose href doesn't change wouldn't trigger a new Next.js navigation, so a
 * `?node=`-driven effect on the target page wouldn't re-fire for a same-chapter click anyway).
 */
export function VariableReferencesPanel({
  storyId,
  currentChapterId,
  onNavigate,
}: {
  storyId: string;
  currentChapterId: string;
  onNavigate: (chapterId: string, nodeId: string) => void;
}) {
  const [usages, setUsages] = useState<VariableUsageOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<VariableUsageOut[]>(`/admin/stories/${storyId}/variable-usages`)
      .then(setUsages)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить переменные"));
  }, [storyId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!usages) return <p className="text-neutral-500">Загрузка…</p>;
  if (usages.length === 0) {
    return <p className="text-sm text-neutral-500">В этой истории пока нет переменных.</p>;
  }

  return (
    <div className="space-y-4">
      {usages.map(({ definition, usages: entries }) => (
        <div key={definition.id} className="rounded border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">{definition.label.ru}</span>
            <span className="text-xs text-neutral-500">{definition.key}</span>
          </div>
          {entries.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">Пока нигде не используется</p>
          ) : (
            // `overflow-x-auto` matches this codebase's one other `<table>` (WardrobeMatrix) -
            // a long chapter title plus the role/type column can overflow a narrow viewport.
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {entries.map((entry, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap py-1 pr-3 text-neutral-600">
                        С{entry.seasonIndex} · Г{entry.chapterIndex} · {entry.chapterTitle.ru}
                      </td>
                      <td className="whitespace-nowrap py-1 pr-3">
                        {/* Weight, not hue, tells "задаёт" from "проверяет" apart - this app's
                         * palette elsewhere is deliberately neutral+red(error)/green(status)/
                         * amber(warning); introducing a new blue/purple pair just for this one
                         * table would be the only place in the admin panel using either. */}
                        <span className={entry.role === "sets" ? "font-medium text-neutral-900" : "text-neutral-600"}>
                          {entry.role === "sets" ? "задаёт" : "проверяет"}
                        </span>{" "}
                        ({NODE_TYPE_LABELS[entry.nodeType]})
                      </td>
                      <td className="whitespace-nowrap py-1 text-right">
                        <button
                          type="button"
                          onClick={() => onNavigate(entry.chapterId, entry.nodeId)}
                          className="text-xs text-neutral-600 underline"
                          title={
                            entry.chapterId !== currentChapterId
                              ? `Открыть главу «${entry.chapterTitle.ru}»`
                              : undefined
                          }
                        >
                          Перейти
                          {/* A subtle cue that this leaves the current chapter, without
                           * repeating the chapter title/season already shown in the first
                           * column of this same row. */}
                          {entry.chapterId !== currentChapterId && <span aria-hidden="true"> ↗</span>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

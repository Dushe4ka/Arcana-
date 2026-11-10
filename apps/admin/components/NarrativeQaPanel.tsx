"use client";

import { useCallback, useEffect, useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";
import type { QaIssue, QaReport, SceneNodeOut } from "@/lib/types";
import { NODE_TYPE_LABELS, nodeSummary } from "@/lib/scene-nodes";

const SEVERITY_LABEL: Record<QaIssue["severity"], string> = {
  error: "Ошибка",
  warning: "Предупреждение",
  info: "Заметка",
};

const SEVERITY_CLASS: Record<QaIssue["severity"], string> = {
  error: "border-red-300 bg-red-50 text-red-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-neutral-200 bg-neutral-50 text-neutral-700",
};

/** Narrative QA for one chapter: what would break for players if it were published right
 * now. Errors block publication on the server; this panel is where an author sees why. */
export function NarrativeQaPanel({
  chapterId,
  nodes,
  onNavigate,
}: {
  chapterId: string;
  nodes: SceneNodeOut[];
  onNavigate: (nodeId: string) => void;
}) {
  const [report, setReport] = useState<QaReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await apiRequest<QaReport>(`/admin/chapters/${chapterId}/qa`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось выполнить проверку");
    } finally {
      setBusy(false);
    }
  }, [chapterId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    run();
  }, [run]);

  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={busy}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {busy ? "Проверяю…" : "Проверить заново"}
        </button>
        {report && (
          <span
            className={`rounded px-2 py-1 text-sm font-medium ${
              report.publishable ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {report.publishable ? "Можно публиковать" : `Публикация заблокирована: ошибок — ${report.errorCount}`}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {report && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Сцен" value={report.stats.nodes ?? 0} />
            <Stat
              label="Покрытие ветвей"
              value={report.stats.coveragePercent !== undefined ? `${report.stats.coveragePercent}%` : "—"}
              hint={
                report.stats.explorationComplete === false
                  ? "вариантов слишком много, обход неполный"
                  : "доля сцен, до которых дошёл автоматический обход всех выборов"
              }
            />
            <Stat
              label="Финалов достижимо"
              value={`${report.stats.reachableEndings ?? 0} из ${report.stats.endings ?? 0}`}
            />
            <Stat label="Проверено состояний" value={report.stats.exploredStates ?? 0} />
          </dl>

          {report.issues.length === 0 ? (
            <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              Проблем не найдено.
            </p>
          ) : (
            <ul className="space-y-2">
              {report.issues.map((issue, index) => {
                const node = issue.nodeId ? nodesById.get(issue.nodeId) : undefined;
                return (
                  <li
                    key={`${issue.code}-${issue.nodeId}-${issue.optionId}-${index}`}
                    className={`rounded border px-3 py-2 text-sm ${SEVERITY_CLASS[issue.severity]}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="mr-2 text-xs font-semibold uppercase tracking-wide">
                          {SEVERITY_LABEL[issue.severity]}
                        </span>
                        {issue.message}
                        {node && (
                          <p className="mt-1 text-xs opacity-80">
                            {NODE_TYPE_LABELS[node.type]}: {nodeSummary(node)}
                          </p>
                        )}
                      </div>
                      {node && (
                        <button
                          onClick={() => onNavigate(node.id)}
                          className="shrink-0 text-xs underline"
                        >
                          Перейти
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded border border-neutral-200 bg-white px-3 py-2" title={hint}>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
    </div>
  );
}

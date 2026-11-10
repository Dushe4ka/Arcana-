"use client";

import { useEffect, useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";

type Entry = { id: string; userEmail: string; method: string; path: string; statusCode: number; createdAt: string };

const ACTIONS: [RegExp, string][] = [
  [/^POST \/api\/admin\/chapters\/[^/]+\/publish$/, "Опубликовал(а) главу"],
  [/^POST \/api\/admin\/chapters\/[^/]+\/unpublish$/, "Снял(а) главу с публикации"],
  [/^POST \/api\/admin\/chapters\/[^/]+\/publications\/\d+\/activate$/, "Вернул(а) прежнюю версию главы"],
  [/^POST \/api\/admin\/chapters\/[^/]+\/import$/, "Импортировал(а) сценарий"],
  [/^POST \/api\/admin\/stories\/[^/]+\/publish$/, "Опубликовал(а) историю"],
  [/^POST \/api\/admin\/stories\/[^/]+\/unpublish$/, "Снял(а) историю с публикации"],
  [/^DELETE \/api\/admin\/stories\//, "Удалил(а) историю"],
  [/^DELETE \/api\/admin\/chapters\//, "Удалил(а) главу"],
  [/^DELETE \/api\/admin\/seasons\//, "Удалил(а) сезон"],
  [/^DELETE \/api\/admin\/scene-nodes\//, "Удалил(а) сцену"],
  [/^DELETE \/api\/admin\/characters\//, "Удалил(а) персонажа"],
  [/^POST \/api\/admin\/users\/[^/]+\/reset-password$/, "Сбросил(а) пароль сотрудника"],
  [/^POST \/api\/admin\/users$/, "Создал(а) сотрудника"],
  [/^POST \/api\/admin\/stories$/, "Создал(а) историю"],
  [/^POST \/api\/admin\/chapters$/, "Создал(а) главу"],
  [/^POST \/api\/admin\/uploads$/, "Загрузил(а) файл"],
  [/^PATCH \/api\/admin\/scene-nodes\//, "Изменил(а) сцену"],
  [/^POST \/api\/admin\/scene-nodes$/, "Добавил(а) сцену"],
  [/^(POST|PATCH|DELETE) \/api\/admin\/choice-options/, "Изменил(а) варианты выбора"],
  [/^PATCH \/api\/admin\/characters\//, "Изменил(а) персонажа"],
];

function describe(entry: Entry): string {
  const key = `${entry.method} ${entry.path}`;
  return ACTIONS.find(([pattern]) => pattern.test(key))?.[1] ?? key;
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Entry[]>("/admin/audit-log?limit=200")
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить журнал"));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!entries) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Журнал действий</h1>
        <p className="text-sm text-neutral-500">Последние 200 изменений, сделанных в админ-панели.</p>
      </div>
      {entries.length === 0 ? (
        <p className="rounded border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
          Пока пусто — здесь появятся публикации, удаления и другие изменения.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 bg-white text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="grid grid-cols-[10rem_14rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2">
              <span className="text-xs tabular-nums text-neutral-500">
                {new Date(entry.createdAt).toLocaleString("ru-RU")}
              </span>
              <span className="truncate">{entry.userEmail}</span>
              <span className="truncate" title={`${entry.method} ${entry.path}`}>
                {describe(entry)}
              </span>
              {entry.statusCode >= 400 && (
                <span className="rounded bg-red-50 px-1.5 text-xs text-red-700">не выполнено ({entry.statusCode})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

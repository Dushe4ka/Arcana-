"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { apiRequest, ApiError } from "@/lib/api";
import type { LocalizedText } from "@arcana/shared";

type ChoiceStat = {
  nodeId: string;
  prompt: LocalizedText | null;
  players: number;
  options: { optionId: string; text: LocalizedText; paid: boolean; players: number; percent: number }[];
};
type ChapterStat = {
  chapterId: string;
  seasonIndex: number;
  chapterIndex: number;
  title: LocalizedText;
  status: string;
  started: number;
  completed: number;
  completionPercent: number;
  reachPercent: number;
  choices: ChoiceStat[];
};

function Bar({ percent, tone = "neutral" }: { percent: number; tone?: "neutral" | "gold" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-neutral-100" role="img" aria-label={`${percent}%`}>
      <div
        className={`h-full ${tone === "gold" ? "bg-amber-500" : "bg-neutral-700"}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

export default function StoryAnalyticsPage() {
  const { id: storyId } = useParams<{ id: string }>();
  const [chapters, setChapters] = useState<ChapterStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ chapters: ChapterStat[] }>(`/admin/stories/${storyId}/analytics`)
      .then((data) => setChapters(data.chapters))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить аналитику"));
  }, [storyId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!chapters) return <p className="text-neutral-500">Загрузка…</p>;

  const anyData = chapters.some((c) => c.started > 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/stories/${storyId}`} className="text-sm text-neutral-600 underline">
          ← К истории
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Аналитика прохождения</h1>
        <p className="text-sm text-neutral-500">
          Считаются игроки, а не нажатия: повторные прохождения и возвраты назад цифры не раздувают.
        </p>
      </div>

      {!anyData && (
        <p className="rounded border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
          Пока никто не начал эту историю — данные появятся после первых прохождений.
        </p>
      )}

      <div className="overflow-x-auto rounded border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Глава</th>
              <th className="px-4 py-2 font-medium">Начали</th>
              <th className="px-4 py-2 font-medium">Дошли от 1-й главы</th>
              <th className="px-4 py-2 font-medium">Завершили</th>
              <th className="w-48 px-4 py-2 font-medium">Доля завершивших</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {chapters.map((c) => (
              <tr key={c.chapterId}>
                <td className="px-4 py-2">
                  {c.seasonIndex}.{c.chapterIndex} {c.title.ru}
                  {c.status !== "PUBLISHED" && <span className="ml-2 text-xs text-neutral-400">черновик</span>}
                </td>
                <td className="px-4 py-2 tabular-nums">{c.started}</td>
                <td className="px-4 py-2 tabular-nums">{c.reachPercent}%</td>
                <td className="px-4 py-2 tabular-nums">{c.completed}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Bar percent={c.completionPercent} />
                    <span className="w-10 text-right text-xs tabular-nums">{c.completionPercent}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chapters
        .filter((c) => c.choices.length > 0)
        .map((c) => (
          <section key={c.chapterId} className="space-y-3">
            <h2 className="text-sm font-semibold">
              Выборы · глава {c.seasonIndex}.{c.chapterIndex} {c.title.ru}
            </h2>
            {c.choices.map((choice) => (
              <div key={choice.nodeId} className="rounded border border-neutral-200 bg-white p-4">
                <p className="text-sm font-medium">{choice.prompt?.ru ?? "Выбор без подсказки"}</p>
                <p className="mb-3 text-xs text-neutral-500">Ответили игроков: {choice.players}</p>
                <div className="space-y-2">
                  {choice.options.map((o) => (
                    <div key={o.optionId} className="grid grid-cols-[minmax(0,1fr)_10rem_4.5rem] items-center gap-3 text-sm">
                      <span className="truncate">
                        {o.text.ru}
                        {o.paid && <span className="ml-2 text-xs text-amber-700">платный</span>}
                      </span>
                      <Bar percent={o.percent} tone={o.paid ? "gold" : "neutral"} />
                      <span className="text-right text-xs tabular-nums text-neutral-600">
                        {o.percent}% · {o.players}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
    </div>
  );
}

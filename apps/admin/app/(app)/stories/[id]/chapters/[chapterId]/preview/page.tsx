"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { apiRequest, ApiError } from "@/lib/api";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import type { ChapterOut, CharacterOut } from "@/lib/types";

export default function ChapterPreviewPage() {
  const { id: storyId, chapterId } = useParams<{ id: string; chapterId: string }>();
  const searchParams = useSearchParams();
  const startNodeId = searchParams.get("nodeId");

  const [chapter, setChapter] = useState<ChapterOut | null>(null);
  const [characters, setCharacters] = useState<CharacterOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [chapterData, charactersData] = await Promise.all([
          apiRequest<ChapterOut>(`/admin/chapters/${chapterId}`),
          apiRequest<CharacterOut[]>(`/admin/characters?storyId=${storyId}`),
        ]);
        setChapter(chapterData);
        setCharacters(charactersData);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Не удалось загрузить главу");
      }
    };
    // Note: unlike the chapter editor page's own effect, `load` is declared INSIDE this
    // effect body (not in outer component scope), so `[chapterId, storyId]` is already a
    // fully exhaustive dependency array - no `eslint-disable ... exhaustive-deps` needed or
    // wanted here (an unnecessary disable directive is itself a quality nit). For the same
    // reason `react-hooks/set-state-in-effect` does not fire on this call in the first place
    // (the rule only flags setState reachable from an *outer-scoped* function invoked in the
    // effect, per PreviewPlayer's `start`) - confirmed via `eslint . ` reporting "Unused
    // eslint-disable directive" when the suppression comment was present, so it is
    // deliberately omitted here rather than copied verbatim from the plan.
    load();
  }, [chapterId, storyId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!chapter) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Превью: Глава {chapter.index} — {chapter.title.ru}
        </h1>
        <Link
          href={`/stories/${storyId}/chapters/${chapterId}`}
          className="text-sm text-neutral-600 underline"
        >
          К редактору главы
        </Link>
      </div>
      <PreviewPlayer chapterId={chapterId} startNodeId={startNodeId} characters={characters} />
    </div>
  );
}

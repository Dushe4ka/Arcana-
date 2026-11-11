"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

import { apiRequest, ApiError } from "@/lib/api";
import type { CharacterOut } from "@/lib/types";
import { StoryGraphExplorer } from "@/components/StoryGraphExplorer";

/** `?chapter=<id>&view=chapter|season|story&node=<id>` - links from the chapter editor and the
 * variables panel land here with the right chapter (and node) already in focus. */
export default function StoryGraphPage() {
  const { id: storyId } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [characters, setCharacters] = useState<CharacterOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<CharacterOut[]>(`/admin/characters?storyId=${storyId}`)
      .then(setCharacters)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить историю"));
  }, [storyId]);

  const view = params.get("view");
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!characters) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-3">
      <Link href={`/stories/${storyId}`} className="text-sm text-neutral-600 underline">
        ← К истории
      </Link>
      <StoryGraphExplorer
        storyId={storyId}
        initialChapterId={params.get("chapter")}
        initialView={view === "season" || view === "story" ? view : params.get("chapter") ? "chapter" : "story"}
        initialNodeId={params.get("node")}
        characters={characters}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { storyCreateSchema, STORY_GENRES } from "@arcana/shared";

import { apiRequest, ApiError } from "@/lib/api";
import type { StoryOut } from "@/lib/types";

export default function StoriesPage() {
  const [stories, setStories] = useState<StoryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setStories(await apiRequest<StoryOut[]>("/admin/stories"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить истории");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Истории</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          {showCreate ? "Отмена" : "Создать историю"}
        </button>
      </div>

      {showCreate && (
        <CreateStoryForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-neutral-500">Загрузка…</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
          {stories.map((story) => (
            <li key={story.id}>
              <Link href={`/stories/${story.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50">
                <span>{story.title.ru}</span>
                <span className="text-xs text-neutral-500">
                  {story.genre} · {story.status}
                </span>
              </Link>
            </li>
          ))}
          {stories.length === 0 && <li className="px-4 py-3 text-neutral-500">Пока нет историй</li>}
        </ul>
      )}
    </div>
  );
}

function CreateStoryForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [titleRu, setTitleRu] = useState("");
  const [genre, setGenre] = useState<(typeof STORY_GENRES)[number]>(STORY_GENRES[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = storyCreateSchema.safeParse({ slug, title: { ru: titleRu }, genre });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте введённые данные");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/admin/stories", { method: "POST", body: JSON.stringify(parsed.data) });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать историю");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border border-neutral-200 bg-white p-4">
      <div>
        <label className="block text-sm text-neutral-600">Slug (латиница, дефисы)</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          placeholder="mask-and-word"
        />
      </div>
      <div>
        <label className="block text-sm text-neutral-600">Название</label>
        <input
          value={titleRu}
          onChange={(e) => setTitleRu(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm text-neutral-600">Жанр</label>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value as (typeof STORY_GENRES)[number])}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        >
          {STORY_GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={submitting} className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        {submitting ? "Создаём…" : "Создать"}
      </button>
    </form>
  );
}

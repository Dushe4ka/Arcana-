"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { seasonCreateSchema, chapterCreateSchema, characterCreateSchema } from "@arcana/shared";

import { apiRequest, ApiError } from "@/lib/api";
import { ImageUpload } from "@/components/ImageUpload";
import type { StoryDetailOut } from "@/lib/types";

export default function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [story, setStory] = useState<StoryDetailOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const load = async () => {
    try {
      setStory(await apiRequest<StoryDetailOut>(`/admin/stories/${id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить историю");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; rule flags React's own canonical pattern regardless of await timing
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onDeleteStory = async () => {
    if (!confirm("Удалить историю целиком? Это необратимо.")) return;
    try {
      await apiRequest(`/admin/stories/${id}`, { method: "DELETE" });
      router.replace("/stories");
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Не удалось удалить историю");
    }
  };

  const onTogglePublish = async () => {
    if (!story) return;
    try {
      const action = story.status === "PUBLISHED" ? "unpublish" : "publish";
      await apiRequest(`/admin/stories/${id}/${action}`, { method: "POST" });
      load();
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Не удалось изменить статус истории");
    }
  };

  const onCoverUploaded = async (url: string) => {
    try {
      await apiRequest(`/admin/stories/${id}`, { method: "PATCH", body: JSON.stringify({ coverImageUrl: url }) });
      load();
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Не удалось сохранить обложку");
    }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!story) return <p className="text-neutral-500">Загрузка…</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{story.title.ru}</h1>
          <p className="text-sm text-neutral-500">
            {story.slug} · {story.genre} · {story.status}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onTogglePublish} className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {story.status === "PUBLISHED" ? "Снять с публикации" : "Опубликовать"}
          </button>
          <button onClick={onDeleteStory} className="rounded border border-red-300 px-3 py-2 text-sm text-red-600">
            Удалить
          </button>
        </div>
      </div>

      {mutationError && <p className="text-sm text-red-600">{mutationError}</p>}

      <ImageUpload label="Обложка" currentUrl={story.coverImageUrl} onUploaded={onCoverUploaded} />

      <SeasonsSection storyId={story.id} seasons={story.seasons} onChanged={load} />

      <CharactersSection storyId={story.id} characters={story.characters} onChanged={load} />
    </div>
  );
}

function SeasonsSection({
  storyId,
  seasons,
  onChanged,
}: {
  storyId: string;
  seasons: StoryDetailOut["seasons"];
  onChanged: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [index, setIndex] = useState(seasons.length + 1);
  const [titleRu, setTitleRu] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = seasonCreateSchema.safeParse({ storyId, index, title: { ru: titleRu } });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте данные");
      return;
    }
    try {
      await apiRequest("/admin/seasons", { method: "POST", body: JSON.stringify(parsed.data) });
      setShowCreate(false);
      setTitleRu("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать сезон");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Сезоны</h2>
        <button
          onClick={() => {
            if (!showCreate) setIndex(seasons.length + 1);
            setShowCreate((v) => !v);
          }}
          className="text-sm text-neutral-600 underline"
        >
          {showCreate ? "Отмена" : "Добавить сезон"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={onCreateSeason} className="flex items-end gap-3 rounded border border-neutral-200 bg-white p-4">
          <div>
            <label className="block text-sm text-neutral-600">Номер</label>
            <input
              type="number"
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              className="mt-1 w-20 rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-neutral-600">Название</label>
            <input
              value={titleRu}
              onChange={(e) => setTitleRu(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">
            Создать
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {seasons.map((season) => (
        <ChaptersList key={season.id} season={season} onChanged={onChanged} />
      ))}
    </section>
  );
}

function ChaptersList({ season, onChanged }: { season: StoryDetailOut["seasons"][number]; onChanged: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [index, setIndex] = useState(season.chapters.length + 1);
  const [titleRu, setTitleRu] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const onCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = chapterCreateSchema.safeParse({ seasonId: season.id, index, title: { ru: titleRu } });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте данные");
      return;
    }
    try {
      await apiRequest("/admin/chapters", { method: "POST", body: JSON.stringify(parsed.data) });
      setShowCreate(false);
      setTitleRu("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать главу");
    }
  };

  const onToggleChapterPublish = async (chapter: StoryDetailOut["seasons"][number]["chapters"][number]) => {
    try {
      const action = chapter.status === "PUBLISHED" ? "unpublish" : "publish";
      await apiRequest(`/admin/chapters/${chapter.id}/${action}`, { method: "POST" });
      setActionError(null);
      onChanged();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Не удалось изменить статус главы");
    }
  };

  return (
    <div className="rounded border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium">
          Сезон {season.index}: {season.title.ru}
        </h3>
        <button
          onClick={() => {
            if (!showCreate) setIndex(season.chapters.length + 1);
            setShowCreate((v) => !v);
          }}
          className="text-sm text-neutral-600 underline"
        >
          {showCreate ? "Отмена" : "Добавить главу"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={onCreateChapter} className="mb-3 flex items-end gap-3 rounded border border-neutral-200 p-3">
          <div>
            <label className="block text-sm text-neutral-600">Номер</label>
            <input
              type="number"
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              className="mt-1 w-20 rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-neutral-600">Название</label>
            <input
              value={titleRu}
              onChange={(e) => setTitleRu(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">
            Создать
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

      <ul className="divide-y divide-neutral-100">
        {season.chapters.map((chapter) => (
          <li key={chapter.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              Глава {chapter.index}: {chapter.title.ru} · {chapter.status}
            </span>
            <button onClick={() => onToggleChapterPublish(chapter)} className="text-neutral-600 underline">
              {chapter.status === "PUBLISHED" ? "Снять с публикации" : "Опубликовать"}
            </button>
          </li>
        ))}
        {season.chapters.length === 0 && <li className="py-2 text-sm text-neutral-500">Пока нет глав</li>}
      </ul>
    </div>
  );
}

function CharactersSection({
  storyId,
  characters,
  onChanged,
}: {
  storyId: string;
  characters: StoryDetailOut["characters"];
  onChanged: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [nameRu, setNameRu] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = characterCreateSchema.safeParse({ storyId, name: { ru: nameRu } });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте данные");
      return;
    }
    try {
      await apiRequest("/admin/characters", { method: "POST", body: JSON.stringify(parsed.data) });
      setShowCreate(false);
      setNameRu("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать персонажа");
    }
  };

  const onSpriteUploaded = async (character: StoryDetailOut["characters"][number], expression: string, url: string) => {
    const sprites = { ...character.sprites, [expression]: url };
    try {
      await apiRequest(`/admin/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ sprites }) });
      setUploadError(null);
      onChanged();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Не удалось сохранить спрайт");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Персонажи</h2>
        <button onClick={() => setShowCreate((v) => !v)} className="text-sm text-neutral-600 underline">
          {showCreate ? "Отмена" : "Добавить персонажа"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={onCreateCharacter} className="flex items-end gap-3 rounded border border-neutral-200 bg-white p-4">
          <div className="flex-1">
            <label className="block text-sm text-neutral-600">Имя</label>
            <input
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">
            Создать
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      <div className="grid grid-cols-2 gap-4">
        {characters.map((character) => (
          <div key={character.id} className="rounded border border-neutral-200 bg-white p-4">
            <p className="mb-2 font-medium" style={{ color: character.nameColor }}>
              {character.name.ru}
            </p>
            <ImageUpload
              label='Спрайт "neutral"'
              currentUrl={character.sprites.neutral}
              onUploaded={(url) => onSpriteUploaded(character, "neutral", url)}
            />
          </div>
        ))}
        {characters.length === 0 && <p className="text-sm text-neutral-500">Пока нет персонажей</p>}
      </div>
    </section>
  );
}

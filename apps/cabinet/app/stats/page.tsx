import { AppShell } from "@/components/AppShell";
import { StoryStatsSection } from "@/components/StoryStatsSection";
import { fetchOrExpire } from "@/lib/api";
import type { StoryStatsView } from "@/lib/types";

export default async function StatsPage() {
  const stories = await fetchOrExpire<StoryStatsView[]>("/me/stats");

  return (
    <AppShell active="stats">
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-text">
        Статистика
      </h1>

      {stories.length === 0 ? (
        <p className="mt-4 text-[13px] leading-relaxed text-text-muted">
          Пока нет статистики — начните любую историю в приложении, и здесь появятся ваши
          отношения с персонажами.
        </p>
      ) : (
        <div className="mt-4 grid gap-4">
          {stories.map((story) => (
            <StoryStatsSection key={story.storyId} story={story} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

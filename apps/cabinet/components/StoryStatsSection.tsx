import { Card } from "@/components/Card";
import { StatBar } from "@/components/StatBar";
import { localized } from "@/lib/format";
import type { StoryStatsView } from "@/lib/types";

export function StoryStatsSection({ story }: { story: StoryStatsView }) {
  return (
    <Card>
      <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-text">
        {localized(story.storyTitle)}
      </h2>

      {story.relationships.length > 0 && (
        <div className="mt-5 flex flex-col gap-4">
          {story.relationships.map((rel) => (
            <StatBar
              key={`${rel.characterId}:${rel.variableKey}`}
              label={localized(rel.label)}
              color={rel.characterNameColor}
              value={rel.value}
              min={rel.minValue}
              max={rel.maxValue}
            />
          ))}
        </div>
      )}

      {story.general.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-text-muted">Прочее</h3>
          <dl className="mt-3 flex flex-col gap-2">
            {story.general.map((stat) => (
              <div key={stat.variableKey} className="flex items-baseline justify-between gap-3">
                <dt className="text-[15px] text-text">{localized(stat.label)}</dt>
                <dd className="text-[15px] tabular-nums text-text-muted">{String(stat.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
}

type Props = {
  label: string;
  color: string;
  value: number | boolean | string;
  min: number | null;
  max: number | null;
};

/** A labelled relationship/stat row. When `min` and `max` are both numbers (and `max > min`)
 * and `value` is numeric, it renders a filled track; otherwise it falls back to a plain
 * `label` + value line with no bar. Pure render — safe as a server component. */
export function StatBar({ label, color, value, min, max }: Props) {
  const bounded =
    typeof value === "number" && min !== null && max !== null && max > min
      ? { value, min, max }
      : null;
  const pct = bounded
    ? Math.max(0, Math.min(1, (bounded.value - bounded.min) / (bounded.max - bounded.min))) * 100
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium text-text">{label}</span>
        <span className="text-[13px] tabular-nums text-text-muted">
          {bounded ? `${bounded.value} / ${bounded.max}` : String(value)}
        </span>
      </div>
      {pct !== null && (
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-raised"
          role="progressbar"
          aria-valuenow={bounded?.value}
          aria-valuemin={bounded?.min}
          aria-valuemax={bounded?.max}
          aria-label={label}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}

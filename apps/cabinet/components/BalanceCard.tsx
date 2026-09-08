import type { WalletView } from "@/lib/types";

const STATS: { key: "soft" | "hard" | "energy"; label: string; className: string }[] = [
  { key: "soft", label: "Монеты", className: "text-coin" },
  { key: "hard", label: "Кристаллы", className: "text-crystal" },
  { key: "energy", label: "Энергия", className: "text-text" },
];

export function BalanceCard({ wallet }: { wallet: WalletView }) {
  const fillPercent =
    wallet.xpForNextLevel > 0
      ? Math.min(100, Math.max(0, (wallet.xpIntoLevel / wallet.xpForNextLevel) * 100))
      : 0;

  return (
    <section
      className="relative overflow-hidden rounded-[22px] bg-surface p-6
        before:absolute before:inset-x-0 before:top-0 before:h-px before:opacity-60
        before:bg-[linear-gradient(90deg,transparent,var(--accent)_50%,transparent)]
        before:content-['']"
    >
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-text">
        Кошелёк
      </h1>

      <div className="mt-5 grid grid-cols-3 divide-x divide-border">
        {STATS.map((stat) => (
          <div key={stat.key} className="flex flex-col items-center gap-1 px-2">
            <span
              className={`font-[family-name:var(--font-display)] text-[34px] leading-none font-bold tabular-nums ${stat.className}`}
            >
              {wallet[stat.key]}
            </span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-medium text-text">Уровень {wallet.level}</span>
          <span className="text-[13px] tabular-nums text-text-muted">
            {wallet.xpIntoLevel} / {wallet.xpForNextLevel}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised"
          role="progressbar"
          aria-valuenow={wallet.xpIntoLevel}
          aria-valuemin={0}
          aria-valuemax={wallet.xpForNextLevel}
          aria-label={`Опыт до следующего уровня: ${wallet.xpIntoLevel} из ${wallet.xpForNextLevel}`}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${fillPercent}%` }} />
        </div>
      </div>
    </section>
  );
}

import { BuyButton } from "@/components/BuyButton";
import { rubles } from "@/lib/format";
import type { PackageView } from "@/lib/types";

export function PackageCard({ pkg }: { pkg: PackageView }) {
  return (
    <article
      className="relative overflow-hidden rounded-[22px] bg-surface p-6
        before:absolute before:inset-x-0 before:top-0 before:h-px before:opacity-60
        before:bg-[linear-gradient(90deg,transparent,var(--accent)_50%,transparent)]
        before:content-['']"
    >
      <div className="flex items-baseline gap-2">
        <span
          className="font-[family-name:var(--font-display)] text-[34px] leading-none font-bold tabular-nums text-crystal"
          aria-hidden="true"
        >
          ◆
        </span>
        <span className="font-[family-name:var(--font-display)] text-[34px] leading-none font-bold tabular-nums text-crystal">
          {pkg.amount}
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">кристаллов</span>
      </div>

      <div className="mt-5">
        <BuyButton packageId={pkg.id} priceLabel={rubles(pkg.priceRubKopecks)} />
      </div>
    </article>
  );
}

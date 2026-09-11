import { BuyButton } from "@/components/BuyButton";
import { Card } from "@/components/Card";
import { rubles } from "@/lib/format";
import type { PackageView } from "@/lib/types";

export function PackageCard({ pkg }: { pkg: PackageView }) {
  return (
    <Card as="article">
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
    </Card>
  );
}

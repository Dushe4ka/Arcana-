import { AppShell } from "@/components/AppShell";
import { PackageCard } from "@/components/PackageCard";
import { fetchOrExpire } from "@/lib/api";
import type { PackageView } from "@/lib/types";

export default async function ShopPage() {
  const packages = await fetchOrExpire<PackageView[]>("/me/purchases/packages");

  return (
    <AppShell active="shop">
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-text">
        Кристаллы
      </h1>

      <p className="mt-4 text-[13px] leading-relaxed text-text-muted">
        Оплата проходит через ЮKassa. После оплаты вернитесь в приложение — баланс обновится
        автоматически.
      </p>

      <div className="mt-4 grid gap-4">
        {packages.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>
    </AppShell>
  );
}

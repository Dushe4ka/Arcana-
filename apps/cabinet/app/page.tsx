import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { BalanceCard } from "@/components/BalanceCard";
import { fetchOrExpire } from "@/lib/api";
import type { WalletView } from "@/lib/types";

export default async function HomePage() {
  const wallet = await fetchOrExpire<WalletView>("/wallet");

  return (
    <AppShell active="home">
      <BalanceCard wallet={wallet} />
      <div className="mt-4 grid gap-3">
        <Link
          href="/shop"
          className="rounded-2xl bg-accent px-5 py-4 text-center font-semibold text-background transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          Пополнить кристаллы
        </Link>
        <Link
          href="/stats"
          className="rounded-2xl border border-border px-5 py-4 text-center text-text transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          Моя статистика по историям
        </Link>
      </div>
    </AppShell>
  );
}

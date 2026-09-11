"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import type { PurchaseStatusView, WalletView } from "@/lib/types";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15;

type Status = "polling" | "done" | "failed" | "timeout";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-8 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
    />
  );
}

function PillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-accent px-5 py-4 text-center font-semibold text-background transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
    >
      {children}
    </Link>
  );
}

function BalanceQuietLink() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center text-[15px] font-medium text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
    >
      Вернуться к балансу
    </Link>
  );
}

function WalletReturn() {
  const purchaseId = useSearchParams().get("purchase");

  const [status, setStatus] = useState<Status>("polling");
  const [hard, setHard] = useState<number | null>(null);

  const baselineRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    function stop() {
      if (interval) clearInterval(interval);
      interval = undefined;
    }

    async function readWalletHard(): Promise<number | null> {
      try {
        const res = await fetch("/api/wallet");
        if (!res.ok) return null;
        const wallet = (await res.json()) as WalletView;
        return typeof wallet.hard === "number" ? wallet.hard : null;
      } catch {
        return null;
      }
    }

    // Reaching "done" or "failed" is terminal - fetch the current balance for display (only
    // meaningful on "done") and stop polling. Guarded by `settled` because the immediate
    // first check and an interval tick can both resolve to a terminal status around the
    // same moment.
    async function finish(next: "done" | "failed") {
      if (settled) return;
      settled = true;
      if (next === "done") {
        const value = await readWalletHard();
        if (!cancelled && value !== null) setHard(value);
      }
      if (!cancelled) setStatus(next);
      stop();
    }

    function armTimeout(tick: () => void) {
      let polls = 0;
      interval = setInterval(() => {
        polls += 1;
        tick();
        if (!cancelled && !settled && polls >= MAX_POLLS && interval) {
          setStatus((prev) => (prev === "polling" ? "timeout" : prev));
          stop();
        }
      }, POLL_INTERVAL_MS);
    }

    if (purchaseId) {
      // Primary path: poll the purchase's own status, not the wallet balance - tells "still
      // processing" apart from "done" even when the webhook credits the wallet before our
      // first balance read (a fast successful payment no longer falls through to timeout).
      async function pollPurchase() {
        try {
          const res = await fetch(`/api/purchases/${purchaseId}`);
          if (!res.ok || cancelled) return;
          const purchase = (await res.json()) as PurchaseStatusView;
          if (purchase.status === "COMPLETED") await finish("done");
          else if (purchase.status === "FAILED" || purchase.status === "CANCELED") {
            await finish("failed");
          }
          // PENDING - keep polling.
        } catch {
          // transient network hiccup - the next tick tries again
        }
      }

      void pollPurchase();
      armTimeout(() => void pollPurchase());
    } else {
      // Fallback - a purchase id should always be present on a real YooKassa return_url, but
      // if it's ever missing, watch the balance for an increase instead of doing nothing.
      async function pollBalance() {
        const value = await readWalletHard();
        if (cancelled || settled || value === null) return;
        setHard(value);
        if (baselineRef.current === null) {
          baselineRef.current = value;
          return;
        }
        if (value > baselineRef.current) void finish("done");
      }

      void (async () => {
        const first = await readWalletHard();
        if (cancelled) return;
        if (first !== null) {
          baselineRef.current = first;
          setHard(first);
        }
        armTimeout(() => void pollBalance());
      })();
    }

    return () => {
      cancelled = true;
      stop();
    };
  }, [purchaseId]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 py-12 text-center"
    >
      {status === "polling" && (
        <>
          <Spinner />
          <p className="font-[family-name:var(--font-display)] text-xl font-bold text-text">
            Обрабатываем платёж…
          </p>
          <p className="text-[13px] text-text-muted">Это занимает несколько секунд</p>
          <BalanceQuietLink />
        </>
      )}

      {status === "done" && (
        <>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold text-text">
            Готово! Кристаллы зачислены.
          </p>
          {hard !== null && (
            <p className="flex items-baseline gap-2">
              <span className="font-[family-name:var(--font-display)] text-[34px] leading-none font-bold tabular-nums text-crystal">
                {hard}
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
                на балансе
              </span>
            </p>
          )}
          <PillLink href="/">Вернуться к балансу</PillLink>
        </>
      )}

      {status === "failed" && (
        <>
          <p className="max-w-xs text-[15px] leading-relaxed text-text">
            Платёж не прошёл. Попробуйте купить кристаллы ещё раз.
          </p>
          <PillLink href="/shop">В магазин</PillLink>
        </>
      )}

      {status === "timeout" && (
        <>
          <p className="max-w-xs text-[15px] leading-relaxed text-text">
            Платёж обрабатывается. Баланс обновится автоматически — можно вернуться в
            приложение, там он тоже подтянется.
          </p>
          <PillLink href="/">Вернуться к балансу</PillLink>
        </>
      )}

      {purchaseId && (
        <p className="text-[11px] tracking-[0.04em] text-text-muted">Платёж {purchaseId}</p>
      )}
    </div>
  );
}

export default function WalletPage() {
  return (
    <AppShell active="home">
      <Suspense
        fallback={
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <Spinner />
            <p className="font-[family-name:var(--font-display)] text-xl font-bold text-text">
              Обрабатываем платёж…
            </p>
          </div>
        }
      >
        <WalletReturn />
      </Suspense>
    </AppShell>
  );
}

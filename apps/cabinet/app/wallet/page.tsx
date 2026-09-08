"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import type { WalletView } from "@/lib/types";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15;

type Status = "polling" | "done" | "timeout";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-8 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
    />
  );
}

function BalancePill() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-accent px-5 py-4 text-center font-semibold text-background transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
    >
      Вернуться к балансу
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
    let interval: ReturnType<typeof setInterval> | undefined;

    async function readHard(): Promise<number | null> {
      try {
        const res = await fetch("/api/wallet");
        if (!res.ok) return null;
        const wallet = (await res.json()) as WalletView;
        return typeof wallet.hard === "number" ? wallet.hard : null;
      } catch {
        return null;
      }
    }

    function stop() {
      if (interval) clearInterval(interval);
      interval = undefined;
    }

    async function poll() {
      const value = await readHard();
      if (cancelled || value === null) return;

      setHard(value);

      // TODO(follow-up): switch from balance-delta to GET /me/purchases/{id} status polling —
      // `hard > baseline` can't distinguish "webhook landed before our first read" from
      // "payment failed", so a fast successful payment can still fall through to `timeout`.
      if (baselineRef.current === null) {
        // Baseline missed on mount — the first successful reading becomes the baseline.
        baselineRef.current = value;
        return;
      }
      if (value > baselineRef.current) {
        setStatus("done");
        stop();
      }
    }

    (async () => {
      const first = await readHard();
      if (cancelled) return;
      if (first !== null) {
        baselineRef.current = first;
        setHard(first);
      }

      let polls = 0;
      interval = setInterval(() => {
        polls += 1;
        void poll().then(() => {
          if (!cancelled && polls >= MAX_POLLS && interval) {
            setStatus((prev) => (prev === "polling" ? "timeout" : prev));
            stop();
          }
        });
      }, POLL_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, []);

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
          <BalancePill />
        </>
      )}

      {status === "timeout" && (
        <>
          <p className="max-w-xs text-[15px] leading-relaxed text-text">
            Платёж обрабатывается. Баланс обновится автоматически — можно вернуться в
            приложение, там он тоже подтянется.
          </p>
          <BalancePill />
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

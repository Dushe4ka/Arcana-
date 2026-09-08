"use client";

import { useState } from "react";

export function BuyButton({ packageId, priceLabel }: { packageId: string; priceLabel: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.confirmationUrl) {
        setError(body?.message ?? "Не удалось начать оплату, попробуйте позже");
        setPending(false);
        return;
      }
      if (
        typeof body.confirmationUrl !== "string" ||
        !body.confirmationUrl.startsWith("https://")
      ) {
        setError("Некорректная ссылка на оплату");
        setPending(false);
        return;
      }
      window.location.href = body.confirmationUrl;
    } catch {
      setError("Нет связи с сервером, попробуйте позже");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={buy}
        disabled={pending}
        aria-busy={pending}
        className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-4 text-[15px] font-semibold text-background transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 disabled:hover:brightness-100 motion-reduce:transition-none"
      >
        {pending && (
          <span
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-background/30 border-t-background motion-reduce:animate-none"
          />
        )}
        {pending ? "Открываем оплату…" : `Купить за ${priceLabel}`}
      </button>
      {error && (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

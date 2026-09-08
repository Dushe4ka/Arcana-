"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-text">
        Что-то пошло не так
      </h1>
      <p className="text-text-muted">
        Не удалось загрузить страницу. Попробуйте ещё раз.
      </p>
      <div className="mt-2 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-accent px-5 py-4 font-semibold text-background transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          Попробовать снова
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-[15px] font-medium text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}

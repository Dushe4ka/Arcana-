export default function SessionExpired() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-text">
        Ссылка недействительна
      </h1>
      <p className="text-text-muted">
        Одноразовая ссылка входа истекла или уже была использована. Откройте личный кабинет в
        приложении Arcana ещё раз — оно выдаст новую.
      </p>
    </main>
  );
}

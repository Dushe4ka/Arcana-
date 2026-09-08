import Link from "next/link";

type NavKey = "home" | "stats" | "shop";

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "home", href: "/", label: "Баланс" },
  { key: "stats", href: "/stats", label: "Статистика" },
  { key: "shop", href: "/shop", label: "Кристаллы" },
];

export function AppShell({
  active,
  children,
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto max-w-md px-4 pt-6 pb-1">
          <Link
            href="/"
            aria-label="Arcana — на главную"
            className="inline-block py-1 pr-[0.35em] font-[family-name:var(--font-display)] text-xl font-bold uppercase tracking-[0.35em] text-text transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            Arcana
          </Link>
        </div>
        <nav className="mx-auto flex max-w-md gap-1 px-3">
          {NAV.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center border-b-2 px-3 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-text-muted hover:text-text"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">{children}</main>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useAuthStore } from "@/lib/auth-store";

const ALLOWED_ROLES = ["WRITER", "EDITOR", "ADMIN"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (status === "signedOut") {
      router.replace("/login");
    } else if (status === "signedIn" && user && !ALLOWED_ROLES.includes(user.role)) {
      // A PLAYER account somehow signed in here - the backend would 403 every request
      // anyway, so bounce them out immediately rather than showing broken screens.
      router.replace("/login");
    }
  }, [status, user, router]);

  if (status === "loading" || status === "signedOut") {
    return <div className="p-8 text-neutral-500">Загрузка…</div>;
  }
  if (user && !ALLOWED_ROLES.includes(user.role)) {
    return <div className="p-8 text-neutral-500">Загрузка…</div>;
  }

  return (
    <div className="min-h-full">
      {/* Sticky only where there is room for it: on a phone the wrapped nav would eat the screen. */}
      <nav className="z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-neutral-300 bg-white px-4 py-3 md:sticky md:top-0 md:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="font-semibold">Arcana Admin</span>
          <Link href="/stories" className="text-sm text-neutral-600 hover:text-neutral-900">
            Истории
          </Link>
          {user?.role === "ADMIN" && (
            <Link href="/users" className="text-sm text-neutral-600 hover:text-neutral-900">
              Сотрудники
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <Link href="/audit" className="text-sm text-neutral-600 hover:text-neutral-900">
              Журнал действий
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-neutral-600">
          <span className="hidden sm:inline">{user?.email}</span>
          <button
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="text-neutral-600 underline hover:text-neutral-900"
          >
            Выйти
          </button>
        </div>
      </nav>
      <main className="p-4 md:p-6">{children}</main>
    </div>
  );
}

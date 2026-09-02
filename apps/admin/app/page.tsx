"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/lib/auth-store";

export default function Home() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "signedIn") router.replace("/stories");
    else if (status === "signedOut") router.replace("/login");
  }, [status, router]);

  return <div className="p-8 text-neutral-500">Загрузка…</div>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginSchema } from "@arcana/shared";

import { useAuthStore } from "@/lib/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Проверьте введённые данные");
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      router.replace("/stories");
    } catch {
      // useAuthStore already set `error` - rendered below.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded border border-neutral-300 bg-white p-6">
        <h1 className="text-lg font-semibold">Arcana Admin</h1>
        <div>
          <label className="block text-sm text-neutral-600">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-600">Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            autoComplete="current-password"
          />
        </div>
        {(fieldError || error) && <p className="text-sm text-red-600">{fieldError ?? error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

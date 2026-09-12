"use client";

import { useEffect, useState } from "react";
import { createStaffUserSchema } from "@arcana/shared";
import type { CreateStaffUserInput } from "@arcana/shared";

import { apiRequest, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { StaffUserOut } from "@/lib/types";

const STAFF_ROLES: CreateStaffUserInput["role"][] = ["WRITER", "EDITOR", "ADMIN"];

const ROLE_LABELS: Record<string, string> = {
  WRITER: "Сценарист",
  EDITOR: "Редактор",
  ADMIN: "Администратор",
};

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<StaffUserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await apiRequest<StaffUserOut[]>("/admin/users"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить сотрудников");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (currentUser && currentUser.role !== "ADMIN") {
    return <p className="text-neutral-500">Доступно только администраторам.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Сотрудники</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          {showCreate ? "Отмена" : "Создать сотрудника"}
        </button>
      </div>

      {showCreate && (
        <CreateStaffUserForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-neutral-500">Загрузка…</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
          {users.map((user) => (
            <li key={user.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-xs text-neutral-500">{user.email}</p>
              </div>
              <span className="text-xs text-neutral-500">{ROLE_LABELS[user.role] ?? user.role}</span>
            </li>
          ))}
          {users.length === 0 && <li className="px-4 py-3 text-neutral-500">Пока нет сотрудников</li>}
        </ul>
      )}
    </div>
  );
}

function CreateStaffUserForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<CreateStaffUserInput["role"]>("WRITER");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = createStaffUserSchema.safeParse({ email, password, displayName, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте введённые данные");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/admin/users", { method: "POST", body: JSON.stringify(parsed.data) });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setRole("WRITER");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать сотрудника");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border border-neutral-200 bg-white p-4">
      <div>
        <label className="block text-sm text-neutral-600">Имя</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          placeholder="Имя Фамилия"
        />
      </div>
      <div>
        <label className="block text-sm text-neutral-600">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          placeholder="writer@arcana.app"
        />
      </div>
      <div>
        <label className="block text-sm text-neutral-600">Пароль</label>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          placeholder="Минимум 8 символов"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Передайте этот пароль сотруднику сами — сменить его можно только повторным созданием
          аккаунта (смена пароля пока не реализована).
        </p>
      </div>
      <div>
        <label className="block text-sm text-neutral-600">Роль</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as CreateStaffUserInput["role"])}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        >
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {submitting ? "Создаём…" : "Создать"}
      </button>
    </form>
  );
}

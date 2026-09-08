import { NextResponse } from "next/server";

import { ApiError, serverFetch } from "@/lib/api";
import type { WalletView } from "@/lib/types";

export async function GET() {
  try {
    const wallet = await serverFetch<WalletView>("/wallet");
    // The backend returns the full wallet row (id, userId, xp, timestamps…) — project down to
    // the WalletView shape so nothing extra reaches client JS.
    const { soft, hard, energy, level, xpIntoLevel, xpForNextLevel } = wallet;
    return NextResponse.json({ soft, hard, energy, level, xpIntoLevel, xpForNextLevel });
  } catch (err) {
    const status = err instanceof ApiError ? err.status || 502 : 502;
    return NextResponse.json({ message: "Не удалось получить баланс" }, { status });
  }
}

import { NextResponse } from "next/server";

import { ApiError, serverFetch } from "@/lib/api";
import type { WalletView } from "@/lib/types";

export async function GET() {
  try {
    const wallet = await serverFetch<WalletView>("/wallet");
    return NextResponse.json(wallet);
  } catch (err) {
    const status = err instanceof ApiError ? err.status || 502 : 502;
    return NextResponse.json({ message: "Не удалось получить баланс" }, { status });
  }
}

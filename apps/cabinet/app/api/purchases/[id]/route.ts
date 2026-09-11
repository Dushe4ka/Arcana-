import { NextResponse } from "next/server";

import { ApiError, serverFetch } from "@/lib/api";
import type { PurchaseStatusView } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const purchase = await serverFetch<PurchaseStatusView>(`/me/purchases/${id}`);
    return NextResponse.json(purchase);
  } catch (err) {
    const status = err instanceof ApiError ? err.status || 502 : 502;
    return NextResponse.json({ message: "Не удалось получить статус платежа" }, { status });
  }
}

import { NextResponse } from "next/server";

import { ApiError, serverFetch } from "@/lib/api";

export async function POST(request: Request) {
  let packageId: unknown;
  try {
    ({ packageId } = await request.json());
  } catch {
    return NextResponse.json({ message: "Некорректный запрос" }, { status: 400 });
  }
  if (typeof packageId !== "string" || !packageId) {
    return NextResponse.json({ message: "Не указан пакет" }, { status: 400 });
  }

  try {
    const data = await serverFetch<{ confirmationUrl: string }>("/me/purchases", {
      method: "POST",
      body: JSON.stringify({ packageId }),
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ message: err.message }, { status: err.status || 502 });
    }
    return NextResponse.json({ message: "Не удалось начать оплату" }, { status: 502 });
  }
}

// src/app/api/plan/list/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function todayJakartaYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const qDate = (url.searchParams.get("deliveryDate") ?? "").trim();
    const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(qDate)
      ? qDate
      : todayJakartaYmd();

    const plans = await prisma.planDaily.findMany({
      where: { deliveryDate },
      orderBy: [{ destination: "asc" }],
      select: {
        deliveryDate: true,
        destination: true,
        group: true,
        tripNo: true,
        tripCount: true,
        forwardEtd: true,
        forwardEta: true,
        reverseEtd: true,
        reverseEta: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, deliveryDate, plans });
  } catch (e) {
    console.error("GET /api/plan/list error:", e);
    return NextResponse.json(
      { ok: false, error: "Failed to load plan." },
      { status: 500 }
    );
  }
}

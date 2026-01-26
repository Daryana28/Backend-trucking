import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function dayRangeWIB(ymd: string) {
  const start = new Date(`${ymd}T00:00:00+07:00`);
  const end = new Date(`${ymd}T23:59:59+07:00`);
  return { start, end };
}

export async function GET() {
  try {
    const today = todayJakartaYmd();
    const { start, end } = dayRangeWIB(today);

    const rows = await prisma.driverStatus.findMany({
      where: {
        isFinished: true,
        OR: [
          { deliveryDate: { gte: today, lte: today } },
          { deliveryDate: { equals: null }, updatedAt: { gte: start, lte: end } },
        ],
      },
      select: { tripGroup: true },
    });

    const completedTrips = new Set(rows.map((r: any) => r.tripGroup)).size;

    return NextResponse.json({
      ok: true,
      today: { completedTrips },
      updates24h: { total: 0, byHour: [] },
      durationsToday: { avgForwardMin: 0, avgReverseMin: 0, sampleTrips: 0 },
    });
  } catch (e) {
    console.error("GET /api/dashboard/metrics error:", e);
    return NextResponse.json(
      {
        ok: false,
        today: { completedTrips: 0 },
        updates24h: { total: 0, byHour: [] },
        durationsToday: { avgForwardMin: 0, avgReverseMin: 0, sampleTrips: 0 },
      },
      { status: 500 }
    );
  }
}

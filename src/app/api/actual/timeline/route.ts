import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { dayRangeEpochSecJakarta, normalizePlate } from "@/lib/actualTrips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickDateFromQuery(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("date") || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return dayRangeEpochSecJakarta(null).ymd;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateYmd = pickDateFromQuery(req);
    const plate = normalizePlate(searchParams.get("plate"));

    if (!plate || plate === "-") {
      return NextResponse.json(
        { ok: false, error: "plate is required" },
        { status: 400 },
      );
    }

    const daily = await prisma.actualTripDaily.findUnique({
      where: {
        uniq_actual_trip_daily: {
          deliveryDate: dateYmd,
          plate,
        },
      },
    });

    if (!daily) {
      return NextResponse.json({ ok: true, date: dateYmd, plate, timeline: [] });
    }

    const events = await prisma.actualTripEvent.findMany({
      where: { dailyId: daily.id },
      orderBy: [{ startSec: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({
      ok: true,
      date: dateYmd,
      plate,
      timeline: events,
    });
  } catch (e: any) {
    console.error("actual timeline error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

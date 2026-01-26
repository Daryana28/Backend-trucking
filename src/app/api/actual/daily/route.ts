import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { dayRangeEpochSecJakarta } from "@/lib/actualTrips";

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
    const dateYmd = pickDateFromQuery(req);
    const includeStops =
      new URL(req.url).searchParams.get("includeStops") === "1";

    const rows = includeStops
      ? await prisma.actualTripDaily.findMany({
          where: { deliveryDate: dateYmd },
          orderBy: [{ plate: "asc" }],
          include: { stops: true },
        })
      : await prisma.actualTripDaily.findMany({
          where: { deliveryDate: dateYmd },
          orderBy: [{ plate: "asc" }],
        });

    return NextResponse.json({
      ok: true,
      date: dateYmd,
      rows: rows.map((r) => ({
        plate: r.plate,
        tripCount: r.tripCount,
        nearStops: r.nearStops,
        targetLat: r.targetLat,
        targetLng: r.targetLng,
        radiusM: r.radiusM,
        cooldownMin: r.cooldownMin,
        lastSyncAt: r.lastSyncAt,
        stops: includeStops ? (r as any).stops : undefined,
      })),
    });
  } catch (e: any) {
    console.error("actual daily error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

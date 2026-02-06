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
    const plateRaw = String(searchParams.get("plate") ?? "").trim();
    const plate = plateRaw ? normalizePlate(plateRaw) : "";
    const limitRaw = Number(searchParams.get("limit") ?? "1000");
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(5000, Math.floor(limitRaw))
        : 1000;

    const rows = await prisma.actualTripEvent.findMany({
      where: {
        deliveryDate: dateYmd,
        ...(plate ? { plate } : {}),
      },
      orderBy: [{ startSec: "asc" }, { plate: "asc" }],
      take: limit,
      select: {
        plate: true,
        type: true,
        startSec: true,
        endSec: true,
        durationSec: true,
        distanceMeters: true,
        lat: true,
        lng: true,
        address: true,
      },
    });

    return NextResponse.json({
      ok: true,
      date: dateYmd,
      plate: plate || null,
      limit,
      rows,
    });
  } catch (e: any) {
    console.error("actual events error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

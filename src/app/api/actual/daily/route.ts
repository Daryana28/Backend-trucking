import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  dayRangeEpochSecJakarta,
  computeTripsFromStops,
  normalizePlate,
} from "@/lib/actualTrips";

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
      rows: rows.map((r: any) => {
        const stops = includeStops ? (r as any).stops : undefined;
        let tripCount = r.tripCount;
        let nearStops = r.nearStops;
        let targetLat = r.targetLat;
        let targetLng = r.targetLng;
        let radiusM = r.radiusM;
        let cooldownMin = r.cooldownMin;

        if (includeStops && Array.isArray(stops) && stops.length > 0) {
          const plate = normalizePlate(r.plate);
          const stopPoints = stops
            .map((s: any) => ({
              lat: typeof s?.lat === "number" ? s.lat : null,
              lng: typeof s?.lng === "number" ? s.lng : null,
              startSec:
                typeof s?.startSec === "number" ? s.startSec : null,
            }))
            .filter(
              (s: any) =>
                typeof s.lat === "number" &&
                typeof s.lng === "number",
            );
          const computed = computeTripsFromStops(plate, stopPoints);
          tripCount = computed.tripCount;
          nearStops = computed.nearStops?.length ?? nearStops;
          targetLat = computed.target?.lat ?? targetLat;
          targetLng = computed.target?.lng ?? targetLng;
          radiusM = computed.radius ?? radiusM;
          cooldownMin = computed.cooldownMin ?? cooldownMin;
        }

        return {
          plate: r.plate,
          tripCount,
          nearStops,
          targetLat,
          targetLng,
          radiusM,
          cooldownMin,
          lastSyncAt: r.lastSyncAt,
          stops,
        };
      }),
    });
  } catch (e: any) {
    console.error("actual daily error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

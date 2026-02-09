import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  dayRangeEpochSecJakarta,
  haversineMeters,
  normalizePlate,
  PLATE_TARGET_POINTS,
  ACTUAL_ETD_TARGETS,
  ARRIVAL_COOLDOWN_MIN,
  PLATE_COOLDOWN_MIN,
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
    const rows = await prisma.actualTripEvent.findMany({
      where: { deliveryDate: dateYmd },
      orderBy: [{ plate: "asc" }, { startSec: "asc" }],
      select: {
        plate: true,
        type: true,
        startSec: true,
        endSec: true,
        lat: true,
        lng: true,
      },
    });

    const byPlate = new Map<string, any[]>();
    for (const r of rows) {
      const plate = normalizePlate(r.plate);
      if (!plate || plate === "-") continue;
      const arr = byPlate.get(plate) ?? [];
      arr.push(r);
      byPlate.set(plate, arr);
    }

    const arrivalByPlate: Record<string, string[]> = {};
    const departureByPlate: Record<string, string[]> = {};

    for (const [plate, events] of byPlate.entries()) {
      const target = PLATE_TARGET_POINTS[plate] ?? null;
      if (!target) continue;
      const radius =
        Number.isFinite(target.radiusM) && typeof target.radiusM === "number"
          ? target.radiusM
          : 5000;
      const cooldownMin = PLATE_COOLDOWN_MIN[plate] ?? ARRIVAL_COOLDOWN_MIN;

      // STOP events (all)
      const allStops = events
        .filter((e) => String(e.type ?? "").toUpperCase() === "STOP")
        .filter((e) => typeof e.startSec === "number")
        .filter((e) => typeof e.lat === "number" && typeof e.lng === "number")
        .map((e) => ({
          ...e,
          distM: haversineMeters(
            { lat: e.lat as number, lng: e.lng as number },
            { lat: target.lat, lng: target.lng },
          ),
        }))
        .sort((a: any, b: any) => (a.startSec as number) - (b.startSec as number));

      const etaStops = allStops.filter((e) => e.distM <= radius);

      // ETD rules:
      // Trip 1: earliest DRIVE startSec of the day
      // Trip N: first ETD-target STOP after previous ETA
      const drives = events
        .filter((e) => String(e.type ?? "").toUpperCase() === "DRIVE")
        .filter((e) => typeof e.startSec === "number")
        .sort(
          (a: any, b: any) => (a.startSec as number) - (b.startSec as number),
        );

      const etdStops = allStops
        .map((e) => {
          const near = ACTUAL_ETD_TARGETS.some((t) => {
            const dist = haversineMeters(
              { lat: e.lat as number, lng: e.lng as number },
              { lat: t.lat, lng: t.lng },
            );
            return dist <= t.radiusM;
          });
          return { ...e, near };
        })
        .filter((e) => e.near)
        .sort(
          (a: any, b: any) => (a.startSec as number) - (b.startSec as number),
        );

      const etdListSec: number[] = [];
      const etaListSec: Array<number | null> = [];

      // Fallback ETA-only list when DRIVE/ETD is missing (timeline empty -> STOP-only)
      // Use cooldown gap to separate trips.
      const etaOnlyListSec: number[] = [];
      if (!drives.length && etaStops.length) {
        let lastEta: number | null = null;
        const minGapSec = cooldownMin * 60;
        for (const s of etaStops) {
          const t = s.startSec as number;
          if (typeof t !== "number") continue;
          if (lastEta == null || t - lastEta >= minGapSec) {
            etaOnlyListSec.push(t);
            lastEta = t;
          }
        }
      }

      // Trip 1 ETD = earliest drive
      if (drives.length) {
        etdListSec.push(drives[0].startSec as number);
      } else if (etdStops.length) {
        // fallback: use first STOP near ETD target (and next after cooldown)
        const minGapSec = cooldownMin * 60;
        let lastEtd: number | null = null;
        for (const s of etdStops) {
          const t = s.startSec as number;
          if (typeof t !== "number") continue;
          if (lastEtd == null || t - lastEtd >= minGapSec) {
            etdListSec.push(t);
            lastEtd = t;
          }
        }
      }

      // Build ETA per ETD, then next ETD after ETA
      let guard = 0;
      while (etdListSec.length > 0 && guard < 10) {
        guard += 1;
        const etdSec = etdListSec[etaListSec.length];
        if (typeof etdSec !== "number") break;

        const etaStop = etaStops.find((s: any) => {
          const t = s.startSec as number;
          return t > etdSec;
        });
        const etaSec = etaStop ? (etaStop.startSec as number) : null;
        etaListSec.push(etaSec);

        // if no ETA, stop adding more trips
        if (etaSec == null) break;

        // next ETD must be after ETA (trip 2+)
        const nextEtdStop = etdStops.find((s: any) => {
          const t = s.startSec as number;
          return t > etaSec;
        });
        if (!nextEtdStop) break;
        etdListSec.push(nextEtdStop.startSec as number);
      }

      // If ETA is missing for later trips, keep ETD but ETA blank
      const fmtTime = (sec: number) =>
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(sec * 1000));

      if (etaListSec.length) {
        arrivalByPlate[plate] = etaListSec.map((sec) =>
          sec != null ? fmtTime(sec) : "",
        );
      }
      if (!etaListSec.length && etaOnlyListSec.length) {
        arrivalByPlate[plate] = etaOnlyListSec.map((sec) =>
          sec != null ? fmtTime(sec) : "",
        );
      }
      if (etdListSec.length) {
        departureByPlate[plate] = etdListSec.map((sec) =>
          sec != null ? fmtTime(sec) : "",
        );
      }
    }

    return NextResponse.json({
      ok: true,
      date: dateYmd,
      arrivals: arrivalByPlate,
      departures: departureByPlate,
    });
  } catch (e: any) {
    console.error("actual arrival error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

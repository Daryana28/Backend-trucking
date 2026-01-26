import prisma from "@/lib/prisma";
import {
  ARRIVAL_COOLDOWN_MIN,
  PLATE_TARGET_POINTS,
  computeTripsFromStops,
  dayRangeEpochSecJakarta,
  fetchStopsForSn,
  haversineMeters,
  listTrackersByPlate,
  normalizePlate,
} from "@/lib/actualTrips";
import { fetchTimelineForPlate } from "@/lib/actualTrips";

export type SyncResultRow = {
  plate: string;
  sn?: string;
  tripCount?: number;
  nearStops?: number;
  cooldownMin?: number;
  ok: boolean;
  reason?: string;
};

export async function syncActualTrips(dateYmd?: string) {
  const day = dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)
    ? dateYmd
    : dayRangeEpochSecJakarta(null).ymd;

  const basePlates = Object.keys(PLATE_TARGET_POINTS);
  const extra = await prisma.driverStatus.findMany({
    where: { deliveryDate: day },
    select: { plate: true },
  });
  const set = new Set<string>();
  for (const p of basePlates) set.add(normalizePlate(p));
  for (const r of extra) {
    const p = normalizePlate(r.plate);
    if (p && p !== "-") set.add(p);
  }
  const plates = Array.from(set);

  const trackerMap = await listTrackersByPlate();
  const results: SyncResultRow[] = [];

  for (const plate of plates) {
    const sn = trackerMap.get(plate) ?? plate;

    // raw payload for audit (timeline response)
    let rawTrack: any;
    try {
      rawTrack = await fetchTimelineForPlate(sn, day);
    } catch (e) {
      results.push({
        plate,
        sn,
        ok: false,
        reason: "timeline_fetch_failed",
      });
      continue;
    }

    const stops = await fetchStopsForSn(sn, day);
    const timelineStops = Array.isArray(rawTrack?.timeline)
      ? rawTrack.timeline.filter((x: any) => x?.type === "STOP")
      : [];
    const timelineStopRows = timelineStops
      .map((s: any, i: number) => ({
        stopNo: Number(s?.stopNo ?? i + 1),
        lat: typeof s?.lat === "number" ? s.lat : null,
        lng: typeof s?.lng === "number" ? s.lng : null,
        startSec: typeof s?.startSec === "number" ? s.startSec : null,
        endSec: typeof s?.endSec === "number" ? s.endSec : null,
        durationSec:
          typeof s?.durationSec === "number" ? s.durationSec : null,
        address: s?.address ? String(s.address) : null,
      }))
      .filter((s: any) => typeof s.lat === "number" && typeof s.lng === "number");

    const stopsForCompute = stops.length ? stops : timelineStopRows;
    const { tripCount, nearStops, target, cooldownMin, radius } =
      computeTripsFromStops(plate, stopsForCompute);

    const daily = await prisma.actualTripDaily.upsert({
      where: {
        uniq_actual_trip_daily: {
          deliveryDate: day,
          plate,
        },
      },
      update: {
        tripCount,
        nearStops: nearStops.length,
        targetLat: target?.lat ?? null,
        targetLng: target?.lng ?? null,
        radiusM: Math.round(radius ?? 0) || null,
        cooldownMin: cooldownMin ?? ARRIVAL_COOLDOWN_MIN,
        lastSyncAt: new Date(),
      },
      create: {
        deliveryDate: day,
        plate,
        tripCount,
        nearStops: nearStops.length,
        targetLat: target?.lat ?? null,
        targetLng: target?.lng ?? null,
        radiusM: Math.round(radius ?? 0) || null,
        cooldownMin: cooldownMin ?? ARRIVAL_COOLDOWN_MIN,
        lastSyncAt: new Date(),
      },
    });

    await prisma.actualTripRaw.upsert({
      where: {
        uniq_actual_trip_raw: {
          deliveryDate: day,
          plate,
        },
      },
      update: {
        payload: JSON.stringify(rawTrack ?? null),
      },
      create: {
        dailyId: daily.id,
        deliveryDate: day,
        plate,
        payload: JSON.stringify(rawTrack ?? null),
      },
    });

    await prisma.actualTripStop.deleteMany({
      where: { dailyId: daily.id },
    });
    await prisma.actualTripEvent.deleteMany({
      where: { dailyId: daily.id },
    });

    if (stopsForCompute.length) {
      const nearSet = new Set(
        nearStops
          .map((s) =>
            `${s.lat.toFixed(5)},${s.lng.toFixed(5)},${s.startSec ?? ""}`,
          )
          .filter(Boolean),
      );

      await prisma.actualTripStop.createMany({
        data: stopsForCompute.map((s: any, idx: number) => {
          const key =
            typeof s.lat === "number" && typeof s.lng === "number"
              ? `${s.lat.toFixed(5)},${s.lng.toFixed(5)},${s.startSec ?? ""}`
              : "";
          const isNear = key ? nearSet.has(key) : false;
          const distM =
            target &&
            typeof s.lat === "number" &&
            typeof s.lng === "number"
              ? Math.round(
                  haversineMeters(
                    { lat: s.lat, lng: s.lng },
                    { lat: target.lat, lng: target.lng },
                  ),
                )
              : null;
          return {
            dailyId: daily.id,
            plate,
            deliveryDate: day,
            stopNo: Number(s.stopNo ?? idx + 1),
            lat: typeof s.lat === "number" ? s.lat : null,
            lng: typeof s.lng === "number" ? s.lng : null,
            startSec: typeof s.startSec === "number" ? s.startSec : null,
            endSec: typeof s.endSec === "number" ? s.endSec : null,
            durationSec:
              typeof s.durationSec === "number" ? s.durationSec : null,
            address: s.address ? String(s.address) : null,
            isNear,
            distM,
          };
        }),
      });
    }

    const timeline = Array.isArray(rawTrack?.timeline) ? rawTrack.timeline : [];
    if (timeline.length) {
      await prisma.actualTripEvent.createMany({
        data: timeline.map((it: any, idx: number) => ({
          dailyId: daily.id,
          plate,
          deliveryDate: day,
          type: String(it?.type ?? "").toUpperCase(),
          stopNo:
            typeof it?.stopNo === "number" ? it.stopNo : Number(idx + 1),
          lat: typeof it?.lat === "number" ? it.lat : null,
          lng: typeof it?.lng === "number" ? it.lng : null,
          startSec: typeof it?.startSec === "number" ? it.startSec : null,
          endSec: typeof it?.endSec === "number" ? it.endSec : null,
          durationSec:
            typeof it?.durationSec === "number" ? it.durationSec : null,
          distanceMeters:
            typeof it?.distanceMeters === "number" ? it.distanceMeters : null,
          address: it?.address ? String(it.address) : null,
        })),
      });
    }

    results.push({
      plate,
      sn,
      tripCount,
      nearStops: nearStops.length,
      cooldownMin: cooldownMin ?? ARRIVAL_COOLDOWN_MIN,
      ok: true,
    });
  }

  return { date: day, results };
}

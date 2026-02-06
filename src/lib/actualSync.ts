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
import { accugpsTrackersLocation, normalizeCoord } from "@/lib/accugps";

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
  const todayYmd = dayRangeEpochSecJakarta(null).ymd;

  // realtime fallback (only for today) when timeline stops are empty
  let realtimeByPlate = new Map<
    string,
    { lat: number; lng: number; tSec: number }
  >();
  if (day === todayYmd) {
    try {
      const loc = await accugpsTrackersLocation();
      const rows = Array.isArray(loc?.data) ? loc.data : [];
      const nowSec = Math.floor(Date.now() / 1000);
      for (const r of rows) {
        const plateRaw =
          r?.alias ?? (r as any)?.plate ?? (r as any)?.sn ?? "";
        const plate = normalizePlate(String(plateRaw));
        if (!plate || plate === "-") continue;
        const lat0 =
          typeof (r as any)?.latitude === "number"
            ? (r as any).latitude
            : typeof (r as any)?.location?.latitude === "number"
              ? (r as any).location.latitude
              : null;
        const lng0 =
          typeof (r as any)?.longitude === "number"
            ? (r as any).longitude
            : typeof (r as any)?.location?.longitude === "number"
              ? (r as any).location.longitude
              : null;
        const lat =
          typeof lat0 === "number" ? normalizeCoord(lat0) : null;
        const lng =
          typeof lng0 === "number" ? normalizeCoord(lng0) : null;
        if (lat == null || lng == null) continue;
        realtimeByPlate.set(plate, { lat, lng, tSec: nowSec });
      }
    } catch {
      realtimeByPlate = new Map();
    }
  }

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

    const existingDaily = await prisma.actualTripDaily.findUnique({
      where: {
        uniq_actual_trip_daily: {
          deliveryDate: day,
          plate,
        },
      },
      select: { id: true, tripCount: true, nearStops: true },
    });

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
    const timelineRaw = Array.isArray(rawTrack?.timeline)
      ? rawTrack.timeline
      : [];
    const timelineStops = timelineRaw.filter((x: any) => x?.type === "STOP");
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

    let stopsForCompute = stops.length ? stops : timelineStopRows;
    if (!stopsForCompute.length && day === todayYmd) {
      const rt = realtimeByPlate.get(plate);
      const target = PLATE_TARGET_POINTS[plate] ?? null;
      if (rt && target) {
        const dist = haversineMeters(
          { lat: rt.lat, lng: rt.lng },
          { lat: target.lat, lng: target.lng },
        );
        const radius = Number.isFinite(target.radiusM)
          ? Number(target.radiusM)
          : 5000;
        if (dist <= radius) {
          stopsForCompute = [
            {
              stopNo: 1,
              lat: rt.lat,
              lng: rt.lng,
              startSec: rt.tSec,
              endSec: rt.tSec,
              durationSec: 0,
              address: null,
            },
          ];
        }
      }
    }
    const { tripCount, nearStops, target, cooldownMin, radius } =
      computeTripsFromStops(plate, stopsForCompute);
    const hasStops = stopsForCompute.length > 0;

    const isTimelineEmpty = (tl: any[]) => {
      if (!Array.isArray(tl) || tl.length === 0) return true;
      if (tl.length === 1) {
        const t0 = tl[0];
        const type = String(t0?.type ?? "").toUpperCase();
        const dist = Number(t0?.distanceMeters ?? 0);
        const dur = Number(t0?.durationSec ?? 0);
        if (type === "DRIVE" && dist <= 0 && dur >= 23 * 3600) return true;
      }
      return false;
    };
    const hasTimeline = !isTimelineEmpty(timelineRaw);

    const daily = await prisma.actualTripDaily.upsert({
      where: {
        uniq_actual_trip_daily: {
          deliveryDate: day,
          plate,
        },
      },
      update: {
        tripCount: hasStops ? tripCount : existingDaily?.tripCount ?? 0,
        nearStops: hasStops ? nearStops.length : existingDaily?.nearStops ?? 0,
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

    if (hasStops) {
      await prisma.actualTripStop.deleteMany({
        where: { dailyId: daily.id },
      });

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

    const timeline = timelineRaw;
    if (hasTimeline) {
      await prisma.actualTripEvent.deleteMany({
        where: { dailyId: daily.id },
      });
      const pointsRaw = Array.isArray(rawTrack?.points) ? rawTrack.points : [];
      const ptsByTime = pointsRaw
        .map((p: any) => ({
          lat: typeof p?.lat === "number" ? p.lat : null,
          lng: typeof p?.lng === "number" ? p.lng : null,
          t: typeof p?.t === "number" ? p.t : null,
        }))
        .filter(
          (p: any) =>
            typeof p.lat === "number" &&
            typeof p.lng === "number" &&
            typeof p.t === "number",
        )
        .sort((a: any, b: any) => (a.t as number) - (b.t as number));

      const pickPointByTime = (t?: number | null) => {
        if (!ptsByTime.length || typeof t !== "number") return null;
        for (const p of ptsByTime) {
          if (p.t >= t) return p;
        }
        return ptsByTime[ptsByTime.length - 1] ?? null;
      };

      await prisma.actualTripEvent.createMany({
        data: timeline.map((it: any, idx: number) => {
          const startSec = typeof it?.startSec === "number" ? it.startSec : null;
          const endSec = typeof it?.endSec === "number" ? it.endSec : null;
          const p =
            typeof it?.lat === "number" && typeof it?.lng === "number"
              ? { lat: it.lat, lng: it.lng }
              : pickPointByTime(startSec) ??
                (endSec != null ? pickPointByTime(endSec) : null);
          return {
            dailyId: daily.id,
            plate,
            deliveryDate: day,
            type: String(it?.type ?? "").toUpperCase(),
            stopNo:
              typeof it?.stopNo === "number" ? it.stopNo : Number(idx + 1),
            lat: p ? p.lat : null,
            lng: p ? p.lng : null,
            startSec,
            endSec,
            durationSec:
              typeof it?.durationSec === "number" ? it.durationSec : null,
            distanceMeters:
              typeof it?.distanceMeters === "number" ? it.distanceMeters : null,
            address: it?.address ? String(it.address) : null,
          };
        }),
      });
    } else if (hasStops) {
      // fallback: save STOP events from stops when timeline is empty
      await prisma.actualTripEvent.deleteMany({
        where: { dailyId: daily.id },
      });
      await prisma.actualTripEvent.createMany({
        data: stopsForCompute.map((s: any, idx: number) => ({
          dailyId: daily.id,
          plate,
          deliveryDate: day,
          type: "STOP",
          stopNo: Number(s.stopNo ?? idx + 1),
          lat: typeof s.lat === "number" ? s.lat : null,
          lng: typeof s.lng === "number" ? s.lng : null,
          startSec: typeof s.startSec === "number" ? s.startSec : null,
          endSec: typeof s.endSec === "number" ? s.endSec : null,
          durationSec:
            typeof s.durationSec === "number" ? s.durationSec : null,
          distanceMeters: null,
          address: s.address ? String(s.address) : null,
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

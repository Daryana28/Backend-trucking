// src/app/api/gps/timeline/route.ts

import { NextResponse } from "next/server";
import {
  accugpsListTrackers,
  accugpsTrackerTrackBySn,
  normalizeCoord,
} from "@/lib/accugps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LatLngT = {
  lat: number;
  lng: number;
  t?: number | null;
  speed?: number | null;
};

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*.*/, "");
}

function toNum(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function ymdJakarta(dt: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayRangeEpochSecJakarta(dateYmd?: string | null) {
  const ymd =
    dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)
      ? dateYmd
      : ymdJakarta(new Date());
  const startMs = new Date(`${ymd}T00:00:00+07:00`).getTime();
  const endMs = new Date(`${ymd}T23:59:59+07:00`).getTime();
  return {
    ymd,
    startSec: Math.floor(startMs / 1000),
    endSec: Math.floor(endMs / 1000),
  };
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function sumDistanceMeters(points: LatLngT[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

function fmtJakartaTimeFromSec(sec?: number | null) {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return null;
  const ms = sec * 1000;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

// tolerant list payload
function pickTrackers(list: any): any[] {
  const d = list?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.list)) return d.list;
  if (Array.isArray(list?.data?.list)) return list.data.list;
  return [];
}

// flatten segments tolerant
function flattenSegments(segments: any): any[] {
  if (!Array.isArray(segments)) return [];
  const out: any[] = [];
  for (const seg of segments) {
    if (Array.isArray(seg)) {
      out.push(...seg);
      continue;
    }
    if (seg && Array.isArray((seg as any).points)) {
      out.push(...(seg as any).points);
      continue;
    }
    if (seg && Array.isArray((seg as any).segment)) {
      out.push(...(seg as any).segment);
      continue;
    }
  }
  return out;
}

function pickStopAddress(r: any): string | null {
  const candidates = [
    r?.name,
    r?.address,
    r?.location,
    r?.poi,
    r?.addr,
    r?.display_name,
  ];
  for (const c of candidates) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s) return s;
  }
  return null;
}

// cari point setelah waktu tertentu (buat infer end)
function findFirstPointAfter(
  ptsByTime: Array<LatLngT & { t: number }>,
  afterSec: number,
) {
  // simple scan (maxPoints umumnya <= 2500 masih aman)
  for (const p of ptsByTime) {
    if (p.t > afterSec) return p;
  }
  return null;
}

function findFirstMovingAfter(
  ptsByTime: Array<LatLngT & { t: number; speed?: number | null }>,
  afterSec: number,
  minSpeedKmh: number,
) {
  for (const p of ptsByTime) {
    if (p.t <= afterSec) continue;
    const sp = typeof p.speed === "number" ? p.speed : null;
    if (sp != null && sp > minSpeedKmh) return p;
  }
  return null;
}

function deriveStopsFromPoints(
  ptsByTime: Array<LatLngT & { t: number; speed?: number | null }>,
) {
  const STOP_SPEED_KMH = 1.5;
  const STOP_DISTANCE_M = 20;
  const MIN_STOP_SEC = 180;
  const out: any[] = [];
  let inStop = false;
  let startIdx = 0;
  let startSec = 0;

  const pushStopSegment = (endIdx: number, endSec: number) => {
    if (endSec <= startSec) return;
    if (endSec - startSec < MIN_STOP_SEC) return;
    let sumLat = 0;
    let sumLng = 0;
    let count = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      sumLat += ptsByTime[i].lat;
      sumLng += ptsByTime[i].lng;
      count += 1;
    }
    const lat = count ? sumLat / count : ptsByTime[startIdx].lat;
    const lng = count ? sumLng / count : ptsByTime[startIdx].lng;
    out.push({
      stopNo: out.length + 1,
      lat,
      lng,
      startSec,
      endSec,
      startTime: startSec,
      endTime: endSec,
      durationSec: endSec - startSec,
      speed: 0,
      distance: 0,
      address: null,
    });
  };

  for (let i = 0; i < ptsByTime.length; i++) {
    const p = ptsByTime[i];
    const sp = typeof p.speed === "number" ? p.speed : null;
    let isStop = false;
    if (sp != null) {
      isStop = sp <= STOP_SPEED_KMH;
    } else if (i > 0) {
      const prev = ptsByTime[i - 1];
      const dist = haversineMeters(prev, p);
      isStop = dist <= STOP_DISTANCE_M;
    }
    if (isStop && !inStop) {
      inStop = true;
      startIdx = i;
      startSec = p.t;
      continue;
    }
    if (!isStop && inStop) {
      const endIdx = Math.max(startIdx, i - 1);
      const endSec = ptsByTime[endIdx].t;
      pushStopSegment(endIdx, endSec);
      inStop = false;
    }
  }

  if (inStop && ptsByTime.length) {
    const endIdx = ptsByTime.length - 1;
    const endSec = ptsByTime[endIdx].t;
    pushStopSegment(endIdx, endSec);
  }

  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("sn") ?? "").trim();
    const date = String(url.searchParams.get("date") ?? "").trim() || null;

    const maxPoints = clampInt(
      url.searchParams.get("maxPoints"),
      2500,
      300,
      8000,
    );

    if (!q) {
      return NextResponse.json(
        { ok: false, error: "sn is required" },
        { status: 400 },
      );
    }

    const key = normKey(q);

    // 1) cari tracker by SN atau alias
    const list = await accugpsListTrackers();
    const trackers = pickTrackers(list);

    const found = trackers.find((t: any) => {
      const sn = normKey(t?.sn);
      const alias = normKey(t?.alias);
      const id = normKey(t?.id);
      return sn === key || alias === key || id === key;
    });

    // fallback: kalau tidak ketemu di list, anggap q adalah SN langsung
    const trackerSn = String(found?.sn ?? q).trim();
    const trackerAlias = String(found?.alias ?? "").trim() || null;

    // 2) range per hari WIB
    const { ymd, startSec, endSec } = dayRangeEpochSecJakarta(date);

    // 3) call TRACK endpoint
    const track = await accugpsTrackerTrackBySn(trackerSn, startSec, endSec);

    const segmentsRaw = track?.data?.segments;
    const stoppingRaw = track?.data?.stopping_points;

    const segmentRows = flattenSegments(segmentsRaw);
    const stopping = Array.isArray(stoppingRaw) ? stoppingRaw : [];

    // 4) points polyline
    let points: LatLngT[] = segmentRows.flatMap((r: any) => {
      const lat0 = toNum(r?.latitude);
      const lng0 = toNum(r?.longitude);
      const lat = typeof lat0 === "number" ? normalizeCoord(lat0) : null;
      const lng = typeof lng0 === "number" ? normalizeCoord(lng0) : null;
      if (lat == null || lng == null) return [];

      const t = toNum(r?.location_time ?? r?.end_time ?? r?.time ?? null);
      const speed = toNum(r?.speed);

      return [{ lat, lng, t: t ?? null, speed: speed ?? null }];
    });

    // sort by time
    try {
      points.sort((a: any, b: any) => {
        const an = Number(a.t);
        const bn = Number(b.t);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return 0;
      });
    } catch {}

    // cap points
    if (points.length > maxPoints) {
      const step = Math.ceil(points.length / maxPoints);
      const sampled: LatLngT[] = [];
      for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
      const last = points[points.length - 1];
      if (last && sampled[sampled.length - 1] !== last) sampled.push(last);
      points = sampled;
    }

    const ptsByTime = points.filter(
      (p): p is LatLngT & { t: number } => typeof p.t === "number",
    );

    // 5) stops (durasi & address)
    const mappedStops = stopping
      .map((r: any, idx: number) => {
        const lat0 = toNum(r?.latitude);
        const lng0 = toNum(r?.longitude);
        const lat = typeof lat0 === "number" ? normalizeCoord(lat0) : null;
        const lng = typeof lng0 === "number" ? normalizeCoord(lng0) : null;
        if (lat == null || lng == null) return null;

        const start = toNum(r?.start_time ?? r?.location_time ?? null);
        const end = toNum(r?.start_driving_time ?? null);

        // infer end: cari point pertama setelah start
        let inferredEnd: number | null = null;
        if (!end && typeof start === "number" && ptsByTime.length) {
          const after = findFirstPointAfter(ptsByTime, start);
          inferredEnd = typeof after?.t === "number" ? after.t : null;
        }

        // ✅ final end:
        // - end (gps) -> inferredEnd -> last point -> end of day
        let endSec2 =
          end ??
          inferredEnd ??
          (ptsByTime.length
            ? (ptsByTime[ptsByTime.length - 1].t as number)
            : null) ??
          endSec;

        const startSec2 = start ?? null;

        const MIN_STOP_SEC = 180;
        const STOP_SPEED_KMH = 1.5;

        if (
          startSec2 != null &&
          endSec2 != null &&
          endSec2 <= startSec2
        ) {
          const nextPoint =
            typeof startSec2 === "number"
              ? findFirstPointAfter(ptsByTime, startSec2)
              : null;
          const nextT = typeof nextPoint?.t === "number" ? nextPoint.t : null;
          endSec2 = nextT ?? inferredEnd ?? startSec2;
        }

        let durationSec =
          startSec2 != null && endSec2 != null && endSec2 >= startSec2
            ? endSec2 - startSec2
            : null;

        if (startSec2 != null && (!durationSec || durationSec < MIN_STOP_SEC)) {
          const moving = findFirstMovingAfter(
            ptsByTime,
            startSec2,
            STOP_SPEED_KMH,
          );
          const movingT =
            typeof moving?.t === "number" ? moving.t : inferredEnd;
          if (movingT != null && movingT > startSec2) {
            endSec2 = movingT;
            durationSec = endSec2 - startSec2;
          }
        }

        const address = pickStopAddress(r);

        return {
          stopNo: idx + 1,
          lat,
          lng,
          startSec: startSec2,
          endSec: endSec2,
          startTime: startSec2,
          endTime: endSec2,
          durationSec,
          speed: toNum(r?.speed) ?? 0,
          distance: toNum(r?.distance) ?? null,
          address, // ✅ dari gps kalau ada
        };
      })
      .filter(Boolean) as any[];

    const hasUsableStop = mappedStops.some(
      (s) => typeof s?.startSec === "number",
    );

    const stops = hasUsableStop
      ? mappedStops
      : deriveStopsFromPoints(ptsByTime);

    // 6) timeline DRIVE/STOP
    const timeline: any[] = [];

    const pushDrive = (fromSec: number | null, toSec: number | null) => {
      if (fromSec == null || toSec == null || toSec <= fromSec) return;
      const slice = ptsByTime.filter((p) => p.t >= fromSec && p.t <= toSec);
      const distM = slice.length >= 2 ? sumDistanceMeters(slice) : 0;

      timeline.push({
        type: "DRIVE",
        startSec: fromSec,
        endSec: toSec,
        durationSec: toSec - fromSec,
        distanceMeters: Math.round(distM),
        startLabel: fmtJakartaTimeFromSec(fromSec),
        endLabel: fmtJakartaTimeFromSec(toSec),
      });
    };

    const pushStop = (s: any) => {
      const fromSec = typeof s.startSec === "number" ? s.startSec : null;
      const toSec = typeof s.endSec === "number" ? s.endSec : null;
      if (fromSec == null || toSec == null || toSec < fromSec) return;

      timeline.push({
        type: "STOP",
        stopNo: s.stopNo,
        lat: s.lat,
        lng: s.lng,
        startSec: fromSec,
        endSec: toSec,
        durationSec:
          typeof s.durationSec === "number" ? s.durationSec : toSec - fromSec,
        startLabel: fmtJakartaTimeFromSec(fromSec),
        endLabel: fmtJakartaTimeFromSec(toSec),
        address: s.address ?? null, // ✅ langsung isi kalau gps ada
      });
    };

    const stopsSorted = [...stops].sort(
      (a: any, b: any) => (a.startSec ?? 0) - (b.startSec ?? 0),
    );

    const tripStart =
      ptsByTime.length && typeof ptsByTime[0].t === "number"
        ? ptsByTime[0].t
        : (startSec ?? null);

    const tripEnd =
      ptsByTime.length && typeof ptsByTime[ptsByTime.length - 1].t === "number"
        ? ptsByTime[ptsByTime.length - 1].t
        : (endSec ?? null);

    if (tripStart != null && tripEnd != null) {
      let cursor = tripStart;
      for (const s of stopsSorted) {
        const sStart = typeof s.startSec === "number" ? s.startSec : null;
        const sEnd = typeof s.endSec === "number" ? s.endSec : null;
        if (sStart == null || sEnd == null) continue;

        pushDrive(cursor, sStart);
        pushStop(s);
        cursor = Math.max(cursor, sEnd);
      }
      pushDrive(cursor, tripEnd);
    }

    const totalDriveSec = timeline
      .filter((x) => x.type === "DRIVE")
      .reduce((a, x) => a + (x.durationSec ?? 0), 0);
    const totalStopSec = timeline
      .filter((x) => x.type === "STOP")
      .reduce((a, x) => a + (x.durationSec ?? 0), 0);
    const totalDistM = timeline
      .filter((x) => x.type === "DRIVE")
      .reduce((a, x) => a + (x.distanceMeters ?? 0), 0);

    return NextResponse.json({
      ok: true,
      date: ymd,
      query: q,
      sn: trackerSn,
      alias: trackerAlias,
      startSec,
      endSec,
      status: track?.status ?? 200,
      message: track?.message ?? "",
      count: points.length,
      points,
      stopsCount: stops.length,
      stops,
      timelineCount: timeline.length,
      timeline,
      totals: {
        totalDistanceMeters: totalDistM,
        totalDriveSec,
        totalStopSec,
      },
    });
  } catch (e) {
    console.error("GET /api/gps/timeline error:", e);
    return NextResponse.json(
      { ok: false, error: "Failed to load timeline" },
      { status: 500 },
    );
  }
}

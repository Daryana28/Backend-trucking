import { accugpsListTrackers, normalizeCoord } from "@/lib/accugps";

export type TripTarget = { lat: number; lng: number; radiusM?: number };

export const ARRIVAL_COOLDOWN_MIN = 300; // 5 hours default

export const PLATE_TARGET_POINTS: Record<string, TripTarget> = {
  "T 8854 DH": { lat: -6.19124, lng: 106.92728, radiusM: 5000 },
  "T 9472 AB": { lat: -6.19124, lng: 106.92728, radiusM: 5000 },
  "T 9473 AB": { lat: -6.35071, lng: 107.28118, radiusM: 5000 },
  "T 9508 AB": { lat: -6.35071, lng: 107.28118, radiusM: 5000 },
  "T 9521 AB": { lat: 6.19124, lng: 106.92728, radiusM: 5000 },
};

export const PLATE_COOLDOWN_MIN: Record<string, number> = {
  "T 9508 AB": 720, // 12 hours
};

export function normalizePlate(input?: string | null) {
  if (!input) return "-";
  const raw = String(input).trim();
  const beforeDash = raw.split("-")[0]?.trim() ?? raw;
  const beforeParen = beforeDash.split("(")[0]?.trim() ?? beforeDash;
  return beforeParen.replace(/\s+/g, " ").toUpperCase();
}

export function dayRangeEpochSecJakarta(dateYmd?: string | null) {
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

export function haversineMeters(
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

export function countTripsByGap(
  stops: Array<{ lat: number; lng: number; startSec?: number | null }>,
  minGapSec: number,
) {
  if (!stops.length) return 0;
  const withTime = stops
    .map((s) => ({
      ...s,
      startSec: typeof s.startSec === "number" ? Math.floor(s.startSec) : null,
    }))
    .filter((s) => typeof s.startSec === "number");
  if (!withTime.length) return 1;
  withTime.sort((a, b) => (a.startSec as number) - (b.startSec as number));
  let count = 1;
  let last = withTime[0].startSec as number;
  for (let i = 1; i < withTime.length; i++) {
    const cur = withTime[i].startSec as number;
    if (cur - last >= minGapSec) {
      count += 1;
      last = cur;
    }
  }
  return count;
}

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

function deriveStopsFromPoints(
  ptsByTime: Array<{ lat: number; lng: number; t: number; speed?: number | null }>,
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

    if (!inStop && isStop) {
      inStop = true;
      startIdx = i;
      startSec = p.t;
    }

    if (inStop && !isStop) {
      const endSec = p.t;
      pushStopSegment(i - 1, endSec);
      inStop = false;
    }
  }

  if (inStop) {
    const last = ptsByTime[ptsByTime.length - 1];
    pushStopSegment(ptsByTime.length - 1, last.t);
  }

  return out;
}

function pickStopsFromTrack(track: any) {
  const stops0 = Array.isArray(track?.data?.stopping_points)
    ? track.data.stopping_points
    : [];
  if (stops0.length) return stops0;

  const segments = flattenSegments(track?.data?.segments ?? []);
  const pts = segments
    .map((p: any) => ({
      lat: normalizeCoord(p?.latitude ?? p?.lat),
      lng: normalizeCoord(p?.longitude ?? p?.lng),
      t: typeof p?.location_time === "number" ? p.location_time : null,
      speed: typeof p?.speed === "number" ? p.speed : null,
    }))
    .filter(
      (p: any) =>
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        typeof p.t === "number",
    )
    .sort((a: any, b: any) => a.t - b.t);

  if (!pts.length) return [];
  return deriveStopsFromPoints(pts);
}

export async function listTrackersByPlate() {
  const list = await accugpsListTrackers();
  const rows = Array.isArray(list?.data)
    ? list.data
    : Array.isArray(list?.data?.data)
      ? list.data.data
      : Array.isArray(list?.data?.list)
        ? list.data.list
        : Array.isArray((list as any)?.list)
          ? (list as any).list
          : [];
  const map = new Map<string, string>();
  for (const r of rows) {
    const alias = typeof r?.alias === "string" ? r.alias : "";
    const sn = typeof r?.sn === "string" ? r.sn : String(r?.id ?? "");
    const plate = normalizePlate(alias);
    if (plate && plate !== "-") map.set(plate, sn);
    const snKey = normalizePlate(sn);
    if (snKey && snKey !== "-") map.set(snKey, sn);
  }
  return map;
}

export async function fetchStopsForSn(sn: string, dateYmd: string) {
  const res = await fetchTimelineForPlate(sn, dateYmd);
  const stops = Array.isArray(res?.stops) ? res.stops : [];
  if (stops.length) return normalizeStops(stops);
  const tl = Array.isArray(res?.timeline) ? res.timeline : [];
  const tlStops = tl.filter((x) => x?.type === "STOP");
  return normalizeStops(tlStops);
}

function appBaseUrl() {
  const v =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";
  return v.endsWith("/") ? v.slice(0, -1) : v;
}

export async function fetchTimelineForPlate(snOrPlate: string, dateYmd: string) {
  const url = `${appBaseUrl()}/api/gps/timeline?sn=${encodeURIComponent(
    snOrPlate,
  )}&date=${encodeURIComponent(dateYmd)}&maxPoints=2500`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`timeline fetch failed: ${res.status}`);
  }
  return res.json();
}

function normalizeStops(stops: any[]) {
  if (!Array.isArray(stops)) return [];
  return stops
    .map((s, i) => {
      const latRaw =
        s?.lat ??
        s?.latitude ??
        s?.latitute ??
        s?.location?.lat ??
        s?.point?.lat ??
        null;
      const lngRaw =
        s?.lng ??
        s?.lon ??
        s?.long ??
        s?.longitude ??
        s?.location?.lng ??
        s?.location?.lon ??
        s?.point?.lng ??
        s?.point?.lon ??
        null;
      const lat =
        typeof latRaw === "number"
          ? latRaw
          : typeof latRaw === "string"
            ? Number(latRaw)
            : null;
      const lng =
        typeof lngRaw === "number"
          ? lngRaw
          : typeof lngRaw === "string"
            ? Number(lngRaw)
            : null;
      return {
        stopNo: Number(s?.stopNo ?? i + 1),
        lat: typeof lat === "number" ? lat : null,
        lng: typeof lng === "number" ? lng : null,
        startSec:
          typeof s?.startSec === "number"
            ? s.startSec
            : typeof s?.startTime === "number"
              ? s.startTime
              : typeof s?.start_time === "number"
                ? s.start_time
                : typeof s?.start_time === "string"
                  ? Number(s.start_time)
                  : null,
        endSec:
          typeof s?.endSec === "number"
            ? s.endSec
            : typeof s?.endTime === "number"
              ? s.endTime
              : typeof s?.end_time === "number"
                ? s.end_time
                : typeof s?.start_driving_time === "number"
                  ? s.start_driving_time
                  : null,
        durationSec:
          typeof s?.durationSec === "number"
            ? s.durationSec
            : null,
        address: s?.address ?? s?.location ?? s?.name ?? null,
      };
    })
    .filter(
      (s) =>
        typeof s.lat === "number" &&
        Number.isFinite(s.lat) &&
        typeof s.lng === "number" &&
        Number.isFinite(s.lng),
    );
}

export function computeTripsFromStops(
  plate: string,
  stops: Array<{ lat: number; lng: number; startSec?: number | null }>,
) {
  const target = PLATE_TARGET_POINTS[plate] ?? null;
  if (!target || !stops.length) return { tripCount: 0, nearStops: [], target };
  const radius = Number.isFinite(target.radiusM)
    ? Number(target.radiusM)
    : 5000;
  const nearStops = stops.filter((p) => {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") return false;
    const dist = haversineMeters(
      { lat: p.lat, lng: p.lng },
      { lat: target.lat, lng: target.lng },
    );
    return dist <= radius;
  });
  const cooldownMin = PLATE_COOLDOWN_MIN[plate] ?? ARRIVAL_COOLDOWN_MIN;
  const tripCount = countTripsByGap(nearStops, cooldownMin * 60);
  return { tripCount, nearStops, target, cooldownMin, radius };
}

// src/app/api/osrm/match/route.ts

import { NextResponse } from "next/server";

type LatLngT = { lat: number; lng: number; t?: string | number | null };

type CleanPoint = { lat: number; lng: number; tSec?: number };

function toSec(t?: string | number | null) {
  if (t == null) return null;
  if (typeof t === "number" && Number.isFinite(t)) {
    // kalau ms, ubah ke detik. kalau sudah detik, tetap.
    return t > 10_000_000_000 ? Math.floor(t / 1000) : Math.floor(t);
  }
  if (typeof t === "string") {
    const ms = Date.parse(t);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return null;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * (s2 * s2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isFiniteLatLng(p: any): p is { lat: number; lng: number; t?: string | number | null } {
  return (
    p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

/**
 * Clean input points before sending to OSRM.
 * Goals:
 * - remove duplicates / tiny jitter
 * - remove unrealistic jumps (common cause of "triangle" polyline)
 * - keep order stable; if all timestamps exist but unsorted, sort by timestamp
 * - downsample to keep OSRM URL short
 */
function cleanForMatch(coords: LatLngT[]) {
  // keep a bit more here, then we will downsample
  const filtered = coords.filter(isFiniteLatLng).slice(-220);
  if (filtered.length < 2) return { points: [] as CleanPoint[], hasAllTs: false };

  const tsArr = filtered.map((p) => toSec(p.t));
  const hasAllTs = tsArr.every((x) => typeof x === "number");

  // if timestamps exist, ensure chronological order
  let ordered: Array<LatLngT & { _tSec?: number }> = filtered.map((p, i) => ({ ...p, _tSec: tsArr[i] ?? undefined }));
  if (hasAllTs) {
    const isNonDecreasing = ordered.every((p, i) => i === 0 || (p._tSec as number) >= (ordered[i - 1]._tSec as number));
    if (!isNonDecreasing) {
      ordered = [...ordered].sort((a, b) => (a._tSec as number) - (b._tSec as number));
    }
  }

  const out: CleanPoint[] = [];

  // thresholds (tuned for vehicle GPS)
  const MIN_MOVE_METERS = 6; // drop tiny jitter
  const MAX_JUMP_METERS_NO_TS = 1200; // if no timestamps, drop big jumps
  const MAX_SPEED_MPS = 55; // ~198 km/h (implied); beyond this, treat as jump

  for (const p of ordered) {
    const cur: CleanPoint = { lat: p.lat, lng: p.lng, tSec: typeof p._tSec === "number" ? p._tSec : undefined };

    const last = out[out.length - 1];
    if (!last) {
      out.push(cur);
      continue;
    }

    const dist = haversineMeters(last, cur);

    // drop duplicates / very small movement
    if (dist < MIN_MOVE_METERS) continue;

    if (hasAllTs && typeof last.tSec === "number" && typeof cur.tSec === "number") {
      const dt = Math.max(1, cur.tSec - last.tSec);
      const impliedMps = dist / dt;

      // if jump creates unrealistic speed, drop this point
      if (impliedMps > MAX_SPEED_MPS) {
        continue;
      }

      // triangle collapse: A -> B -> A' (A' close to A) causes sharp V/triangle.
      // If new point is close to the point before last, replace the middle point.
      const prev = out.length >= 2 ? out[out.length - 2] : null;
      if (prev) {
        const distToPrev = haversineMeters(prev, cur);
        if (distToPrev < 18) {
          // replace last with current (removes the spike)
          out[out.length - 1] = cur;
          continue;
        }
      }

      out.push(cur);
    } else {
      // no timestamps: just remove huge jumps
      if (dist > MAX_JUMP_METERS_NO_TS) continue;

      const prev = out.length >= 2 ? out[out.length - 2] : null;
      if (prev) {
        const distToPrev = haversineMeters(prev, cur);
        if (distToPrev < 18) {
          out[out.length - 1] = cur;
          continue;
        }
      }

      out.push(cur);
    }
  }

  // downsample to keep <= 100 points (OSRM public endpoint URL length)
  const MAX_POINTS = 100;
  if (out.length <= MAX_POINTS) {
    return { points: out, hasAllTs };
  }

  const step = Math.ceil(out.length / MAX_POINTS);
  const sampled: CleanPoint[] = [];
  for (let i = 0; i < out.length; i += step) sampled.push(out[i]);
  // ensure last point included
  if (sampled[sampled.length - 1] !== out[out.length - 1]) sampled.push(out[out.length - 1]);

  return { points: sampled, hasAllTs };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const coords: LatLngT[] = Array.isArray(body?.coords) ? body.coords : [];

    const { points: cleaned, hasAllTs } = cleanForMatch(coords);

    if (cleaned.length < 2) {
      return NextResponse.json({ ok: true, points: [] });
    }

    const coordStr = cleaned.map((p) => `${p.lng},${p.lat}`).join(";");

    // radiuses: bantu OSRM match (meter)
    // 30m lebih toleran daripada 25m kalau ada noise, tapi tetap cukup ketat.
    const radiuses = cleaned.map(() => "30").join(";");

    // timestamps (opsional): kalau ada lengkap, OSRM match bisa lebih stabil
    const timestamps = hasAllTs ? cleaned.map((p) => String(p.tSec as number)).join(";") : null;

    const base =
      `https://router.project-osrm.org/match/v1/driving/${coordStr}` +
      `?geometries=geojson&overview=full&steps=false` +
      `&radiuses=${encodeURIComponent(radiuses)}` +
      `&gaps=ignore` +
      `&tidy=true`; // tidy bantu kurangi artefak loop kecil

    const url = timestamps ? `${base}&timestamps=${encodeURIComponent(timestamps)}` : base;

    // timeout biar request ga gantung
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);

    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "nextjs-osrm" },
      signal: ac.signal,
    }).finally(() => clearTimeout(t));

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, points: [], error: `OSRM error ${res.status}` },
        { status: 200 }
      );
    }

    const data = await res.json();

    const coordsGeo: [number, number][] =
      data?.matchings?.[0]?.geometry?.coordinates ?? [];

    const points = coordsGeo.map(([lng, lat]) => ({ lat, lng }));

    return NextResponse.json({ ok: true, points });
  } catch (err) {
    console.error("OSRM match route error:", err);
    return NextResponse.json(
      { ok: false, points: [], error: "OSRM match failed" },
      { status: 200 }
    );
  }
}

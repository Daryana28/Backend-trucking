// src/app/api/osrm/match/route.ts

import { NextResponse } from "next/server";

type LatLngT = { lat: number; lng: number; t?: string | number | null };

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const coords: LatLngT[] = Array.isArray(body?.coords) ? body.coords : [];

    const cleaned = coords
      .filter(
        (p) =>
          p &&
          typeof p.lat === "number" &&
          typeof p.lng === "number" &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng)
      )
      .slice(-100); // batasi biar aman

    if (cleaned.length < 2) {
      return NextResponse.json({ ok: true, points: [] });
    }

    const coordStr = cleaned.map((p) => `${p.lng},${p.lat}`).join(";");

    // ✅ radiuses: bantu OSRM match (meter). 25m umum untuk GPS
    const radiuses = cleaned.map(() => "25").join(";");

    // ✅ timestamps (opsional): kalau ada, OSRM match bisa lebih stabil
    const tsArr = cleaned.map((p) => toSec(p.t));
    const hasAllTimestamps = tsArr.every((x) => typeof x === "number");
    const timestamps = hasAllTimestamps ? (tsArr as number[]).join(";") : null;

    const base =
      `https://router.project-osrm.org/match/v1/driving/${coordStr}` +
      `?geometries=geojson&overview=full&steps=false` +
      `&radiuses=${encodeURIComponent(radiuses)}` +
      `&gaps=ignore`; // tahan kalau ada loncatan / gap

    const url = timestamps
      ? `${base}&timestamps=${encodeURIComponent(timestamps)}`
      : base;

    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "nextjs-osrm" },
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, points: [] }, { status: 200 });
    }

    const data = await res.json();

    const coordsGeo: [number, number][] =
      data?.matchings?.[0]?.geometry?.coordinates ?? [];

    const points = coordsGeo.map(([lng, lat]) => ({ lat, lng }));

    return NextResponse.json({ ok: true, points });
  } catch (err) {
    console.error("OSRM match route error:", err);
    return NextResponse.json({ ok: false, points: [] }, { status: 200 });
  }
}

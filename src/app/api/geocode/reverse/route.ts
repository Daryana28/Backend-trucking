// src/app/api/geocode/reverse/route.ts

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// cache sederhana (in-memory)
const CACHE = new Map<string, { at: number; value: any }>();
const TTL = 24 * 60 * 60 * 1000; // 1 hari

function toNum(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = toNum(url.searchParams.get("lat"));
    const lng = toNum(url.searchParams.get("lng"));

    if (lat == null || lng == null) {
      return NextResponse.json(
        { ok: false, error: "lat & lng required" },
        { status: 400 },
      );
    }

    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const cached = CACHE.get(key);
    if (cached && Date.now() - cached.at < TTL) {
      return NextResponse.json({ ok: true, cached: true, ...cached.value });
    }

    // Nominatim reverse
    const qs = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      zoom: "18",
      addressdetails: "1",
    });

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?${qs.toString()}`;

    const res = await fetch(nominatimUrl, {
      headers: {
        // penting untuk Nominatim
        "User-Agent": "truckingapp/1.0 (contact: dev@local)",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "geocode failed" },
        { status: 200 },
      );
    }

    const data = await res.json();

    const value = {
      displayName: data?.display_name ?? null,
      address: data?.address ?? null,
    };

    CACHE.set(key, { at: Date.now(), value });

    return NextResponse.json({ ok: true, cached: false, ...value });
  } catch (e) {
    console.error("reverse geocode error:", e);
    return NextResponse.json(
      { ok: false, error: "server error" },
      { status: 200 },
    );
  }
}

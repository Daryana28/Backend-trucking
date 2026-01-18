// src/app/api/gps/trackers/route.ts

import { NextResponse } from "next/server";
import { accugpsListTrackers, normalizeCoord } from "@/lib/accugps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ===== server-side cache (biar ga kena 429) =====
const LOCAL_CACHE = {
  data: [] as any[],
  savedAt: 0, // epoch ms
};
const TTL_MS = 12_000; // 12 detik (frontend kamu polling 15 detik)

// speed: provider kadang m/s (di /trackers/location) kadang km/h (di /trackers, tergantung server)
// kita bikin heuristic biar aman:
function normalizeSpeedToKmh(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n) || n < 0) return 0;

  // kalau sangat besar, pasti sudah km/h
  if (n >= 80) return Math.round(n * 10) / 10;

  // kalau kecil, kemungkinan m/s → konversi ke km/h
  // (contoh 10 m/s = 36 km/h)
  return Math.round(n * 3.6 * 10) / 10;
}

function toNum(v: any) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function GET() {
  const now = Date.now();

  // ✅ kalau masih dalam TTL, balikin cache supaya upstream gak kebomb
  if (LOCAL_CACHE.data.length && now - LOCAL_CACHE.savedAt < TTL_MS) {
    return NextResponse.json(
      {
        status: 200,
        message: "Operation is successful.",
        data: LOCAL_CACHE.data,
        cached: true,
        serverTime: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  try {
    const list = await accugpsListTrackers();

    // Jika upstream balikin selain 200, fallback ke cache (kalau ada)
    if (Number(list?.status) !== 200) {
      if (LOCAL_CACHE.data.length) {
        return NextResponse.json(
          {
            status: 200,
            message: `Upstream not ready (${list?.status}). Using cached data.`,
            data: LOCAL_CACHE.data,
            cached: true,
            serverTime: new Date().toISOString(),
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        list ?? { status: 500, message: "AccuGPS list error", data: [] },
        { status: 200 }
      );
    }

    const rows = Array.isArray((list as any)?.data)
      ? (list as any).data
      : Array.isArray((list as any)?.data?.data)
      ? (list as any).data.data
      : [];

    // map jadi format yang dipakai RealtimeMap kamu
    const mapped = rows
      .map((t: any) => {
        const sn = String(t?.sn ?? "").trim();
        if (!sn) return null;

        const lat0 = toNum(t?.latitude) ?? toNum(t?.lat);
        const lng0 = toNum(t?.longitude) ?? toNum(t?.lng);

        const latitude = typeof lat0 === "number" ? normalizeCoord(lat0) : null;
        const longitude =
          typeof lng0 === "number" ? normalizeCoord(lng0) : null;

        return {
          id: t?.id ?? sn,
          sn,
          alias: typeof t?.alias === "string" ? t.alias : null, // plate
          latitude,
          longitude,
          speed: normalizeSpeedToKmh(t?.speed ?? 0),
          degree: toNum(t?.degree),
          location_time: toNum(t?.location_time),
          login: toNum(t?.login),
          is_shared: toNum(t?.is_shared),
        };
      })
      .filter(Boolean);

    // ✅ simpan cache kalau ada data valid
    if (mapped.length) {
      LOCAL_CACHE.data = mapped;
      LOCAL_CACHE.savedAt = now;
    }

    return NextResponse.json(
      {
        status: 200,
        message: "Operation is successful.",
        data: mapped,
        cached: false,
        serverTime: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("GET /api/gps/trackers error:", e);

    // ✅ kalau error / 429 / apapun → fallback ke cache biar truck tetap muncul
    if (LOCAL_CACHE.data.length) {
      return NextResponse.json(
        {
          status: 200,
          message: `Server fallback: ${e?.message ?? "error"}`,
          data: LOCAL_CACHE.data,
          cached: true,
          serverTime: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { status: 500, message: "Server error", data: [] },
      { status: 200 }
    );
  }
}

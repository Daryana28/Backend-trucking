// src/app/api/gps/history/route.ts

import { NextResponse } from "next/server";
import {
  accugpsListTrackers,
  accugpsTrackerTrackBySn,
  normalizeCoord,
} from "@/lib/accugps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function pickTrackers(list: any): any[] {
  const d = list?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.list)) return d.list;
  if (Array.isArray(list?.data?.list)) return list.data.list;
  return [];
}

function isDigits(s: string) {
  return /^\d+$/.test(s);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("sn") ?? "").trim();

    // ✅ Mode 1 (lama): minutes
    const minutes = clampInt(url.searchParams.get("minutes"), 180, 10, 24 * 60);

    // ✅ Mode 2 (baru): startSec & endSec untuk Trip Replay range
    const startSecQ = toNum(url.searchParams.get("startSec"));
    const endSecQ = toNum(url.searchParams.get("endSec"));

    if (!q) {
      return NextResponse.json(
        { ok: false, error: "sn is required" },
        { status: 400 },
      );
    }

    const key = normKey(q);

    // 1) Try list tracker (best effort). Kalau error / upstream down, fallback ke SN langsung.
    let trackers: any[] = [];
    let listStatus: number | null = null;
    let listMessage: string | null = null;

    try {
      const list = await accugpsListTrackers();
      listStatus =
        typeof list?.status === "number"
          ? list.status
          : Number(list?.status ?? NaN);
      listMessage = typeof list?.message === "string" ? list.message : null;

      // kalau status 200, ambil trackers
      if (!Number.isFinite(listStatus) || listStatus === 200) {
        trackers = pickTrackers(list);
      }
    } catch (e) {
      trackers = [];
    }

    const found = trackers.find((t: any) => {
      const sn = normKey(t?.sn);
      const alias = normKey(t?.alias);
      const id = normKey(t?.id);
      return sn === key || alias === key || id === key;
    });

    // ✅ SN final:
    // - kalau ketemu di list → pakai found.sn
    // - kalau tidak ketemu / list gagal → kalau q angka, treat q sebagai SN langsung
    const trackerSn = String(found?.sn ?? (isDigits(q) ? q : "")).trim();
    const trackerAlias = String(found?.alias ?? "").trim() || null;

    if (!trackerSn) {
      return NextResponse.json(
        {
          ok: false,
          error: "tracker SN not found",
          hint: "Isi sn dengan SN device (angka) atau alias/plate yang ada di AccuGPS",
          debug: {
            query: q,
            normalized: key,
            trackersCount: trackers.length,
            upstreamStatus: listStatus,
            upstreamMessage: listMessage,
          },
        },
        { status: 404 },
      );
    }

    // 2) range epoch seconds
    const nowSec = Math.floor(Date.now() / 1000);

    // ✅ kalau startSec/endSec dikasih (Trip replay), pakai itu.
    // fallback ke mode minutes.
    let startSec = nowSec - minutes * 60;
    let endSec = nowSec;

    if (
      typeof startSecQ === "number" &&
      Number.isFinite(startSecQ) &&
      typeof endSecQ === "number" &&
      Number.isFinite(endSecQ)
    ) {
      // safety clamp: maksimal 7 hari biar ga berat
      const maxSpan = 7 * 24 * 60 * 60;
      const a = Math.max(0, Math.floor(startSecQ));
      const b = Math.max(0, Math.floor(endSecQ));
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      endSec = hi;
      startSec =
        Math.max(0, hi - maxSpan) > lo ? Math.max(0, hi - maxSpan) : lo;
    }

    // 3) call TRACK endpoint (polyline/history)
    const track = await accugpsTrackerTrackBySn(trackerSn, startSec, endSec);

    const segments = Array.isArray(track?.data?.segments)
      ? track.data.segments
      : [];
    const stopping = Array.isArray(track?.data?.stopping_points)
      ? track.data.stopping_points
      : [];

    // 4) flatten segments -> points
    const points = segments
      .flatMap((seg: any[]) => (Array.isArray(seg) ? seg : []))
      .map((r: any) => {
        const lat0 = toNum(r?.latitude);
        const lng0 = toNum(r?.longitude);
        const lat = typeof lat0 === "number" ? normalizeCoord(lat0) : null;
        const lng = typeof lng0 === "number" ? normalizeCoord(lng0) : null;
        if (lat == null || lng == null) return null;

        const t = toNum(r?.location_time ?? r?.end_time ?? null);
        const speed = toNum(r?.speed);

        return { lat, lng, t, speed: speed ?? null };
      })
      .filter(
        (x: any) => x && typeof x.lat === "number" && typeof x.lng === "number",
      );

    // 5) stopping points -> stops (✅ durasi akurat: start_driving_time - start_time)
    const stops = stopping
      .map((r: any, idx: number) => {
        const lat0 = toNum(r?.latitude);
        const lng0 = toNum(r?.longitude);
        const lat = typeof lat0 === "number" ? normalizeCoord(lat0) : null;
        const lng = typeof lng0 === "number" ? normalizeCoord(lng0) : null;
        if (lat == null || lng == null) return null;

        const start = toNum(r?.start_time ?? r?.location_time ?? null);
        const end = toNum(r?.start_driving_time ?? null);

        const name = String(r?.name ?? "").trim() || null;

        // ✅ durasi utama dari API
        let durationSec: number | null =
          start != null && end != null && end >= start ? end - start : null;

        // fallback (kalau end kosong): cari point pertama setelah start
        if (durationSec == null && start != null && points.length) {
          const after = points.find(
            (p: any) => typeof p.t === "number" && p.t > start,
          );
          const inferredEnd = typeof after?.t === "number" ? after.t : null;
          if (inferredEnd != null && inferredEnd >= start) {
            durationSec = inferredEnd - start;
          }
        }

        return {
          stopNo: idx + 1,
          lat,
          lng,

          // ini tetap biar RealtimeMap kamu kompatibel
          startTime: start,
          endTime: end ?? null,
          durationSec,

          // tambahan info
          name, // address dari AccuGPS (kadang kosong)
          speed: toNum(r?.speed) ?? 0,
          distance: toNum(r?.distance) ?? null,
        };
      })
      .filter(Boolean);

    // 6) sort points by t
    try {
      points.sort((a: any, b: any) => {
        const an = Number(a.t);
        const bn = Number(b.t);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return 0;
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      query: q,
      sn: trackerSn,
      alias: trackerAlias,

      // mode info
      minutes,
      startSec,
      endSec,

      upstream: {
        status: listStatus,
        message: listMessage,
        trackersCount: trackers.length,
      },

      // data
      status: track?.status ?? 200,
      message: track?.message ?? "",
      count: points.length,
      points,
      stopsCount: stops.length,
      stops,
      total: track?.data?.total ?? null,
    });
  } catch (e) {
    console.error("GET /api/gps/history error:", e);
    return NextResponse.json(
      { ok: false, error: "Failed to load history" },
      { status: 500 },
    );
  }
}

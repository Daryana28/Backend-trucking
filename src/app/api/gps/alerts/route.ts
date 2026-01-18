// src/app/api/gps/alerts/route.ts
import { NextResponse } from "next/server";
import { accugpsListTrackers, accugpsTrackerAlerts } from "@/lib/accugps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayRangeEpochSecJakarta() {
  // range: 00:00:00 - 23:59:59 WIB
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";

  // bikin Date UTC dari WIB: trik sederhana → parse string +0700
  const start = new Date(`${y}-${m}-${d}T00:00:00+07:00`).getTime();
  const end = new Date(`${y}-${m}-${d}T23:59:59+07:00`).getTime();

  return { startSec: Math.floor(start / 1000), endSec: Math.floor(end / 1000) };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sn = (url.searchParams.get("sn") ?? "").trim();
    if (!sn) {
      return NextResponse.json(
        { ok: false, error: "sn wajib" },
        { status: 400 }
      );
    }

    const list = await accugpsListTrackers();
    const trackers = list?.data ?? [];
    const t = trackers.find((x) => String(x.sn ?? "").trim() === sn);

    const trackerId = String(t?.id ?? "").trim();
    if (!trackerId) {
      return NextResponse.json(
        { ok: false, error: "tracker id tidak ditemukan" },
        { status: 404 }
      );
    }

    const { startSec, endSec } = todayRangeEpochSecJakarta();
    const alerts = await accugpsTrackerAlerts(trackerId, startSec, endSec);

    return NextResponse.json({
      ok: true,
      sn,
      trackerId,
      status: alerts?.status ?? 200,
      data: alerts?.data ?? [],
    });
  } catch (e) {
    console.error("GET /api/gps/alerts error:", e);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}

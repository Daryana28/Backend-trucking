// src/app/api/dashboard/metrics/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toWibParts(d: Date) {
  // WIB = UTC+7
  const w = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return {
    y: w.getUTCFullYear(),
    m: w.getUTCMonth(),
    d: w.getUTCDate(),
    hh: w.getUTCHours(),
  };
}

function startOfTodayWibUtc(): Date {
  const now = new Date();
  const w = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  // buat "00:00 WIB" tapi dalam UTC
  const startWibAsUtc = new Date(
    Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), 0, 0, 0, 0)
  );
  // convert balik ke UTC asli (kurangi 7 jam)
  return new Date(startWibAsUtc.getTime() - 7 * 60 * 60 * 1000);
}

export async function GET() {
  try {
    const now = new Date();

    const todayStartUtc = startOfTodayWibUtc();
    const todayEndUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);

    const last24hUtc = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // =========================
    // 1) Trip selesai hari ini (WIB)
    // =========================
    // trip selesai = isFinished true (reverse sudah punya ETD&ETA)
    const finishedToday = await prisma.driverStatus.findMany({
      where: {
        isFinished: true,
        updatedAt: {
          gte: todayStartUtc,
          lt: todayEndUtc,
        },
      },
      select: { tripGroup: true, driverId: true },
      take: 20000,
    });

    const finishedTripSet = new Set(
      finishedToday.map((x) => `${x.tripGroup}__${x.driverId}`)
    );

    const completedTripsToday = finishedTripSet.size;

    // =========================
    // 2) Update per jam (24 jam terakhir, WIB)
    // =========================
    const updates24h = await prisma.driverStatus.findMany({
      where: {
        updatedAt: { gte: last24hUtc },
      },
      select: { updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 50000,
    });

    // bucket 24 jam WIB (label: HH:00)
    const hourBuckets = new Map<string, number>();
    for (const row of updates24h) {
      const p = toWibParts(row.updatedAt);
      const label = `${String(p.hh).padStart(2, "0")}:00`;
      hourBuckets.set(label, (hourBuckets.get(label) ?? 0) + 1);
    }

    // Biar chart rapi: pastikan 24 jam terakhir punya urutan label
    const byHour: { label: string; value: number }[] = [];
    // ambil "now" WIB, mundur 23 jam
    const nowWib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    for (let i = 23; i >= 0; i--) {
      const t = new Date(nowWib.getTime() - i * 60 * 60 * 1000);
      const hh = String(t.getUTCHours()).padStart(2, "0");
      const label = `${hh}:00`;
      byHour.push({ label, value: hourBuckets.get(label) ?? 0 });
    }

    // =========================
    // 3) Durasi rata-rata forward vs reverse (hari ini, WIB)
    // =========================
    // Ambil status hari ini saja biar ringan
    const todayStatuses = await prisma.driverStatus.findMany({
      where: {
        updatedAt: { gte: todayStartUtc, lt: todayEndUtc },
      },
      select: {
        tripGroup: true,
        driverId: true,
        direction: true,
        updatedAt: true,
        isFinished: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 50000,
    });

    // group per trip
    type TripAgg = {
      finished: boolean;
      forwardStart?: Date;
      forwardEnd?: Date;
      reverseStart?: Date;
      reverseEnd?: Date;
    };

    const tripMap = new Map<string, TripAgg>();

    for (const s of todayStatuses) {
      const key = `${s.tripGroup}__${s.driverId}`;
      const agg = tripMap.get(key) ?? { finished: false };

      if (s.isFinished) agg.finished = true;

      if (s.direction === "forward") {
        if (!agg.forwardStart) agg.forwardStart = s.updatedAt;
        agg.forwardEnd = s.updatedAt;
      } else if (s.direction === "reverse") {
        if (!agg.reverseStart) agg.reverseStart = s.updatedAt;
        agg.reverseEnd = s.updatedAt;
      }

      tripMap.set(key, agg);
    }

    let sumF = 0;
    let cntF = 0;
    let sumR = 0;
    let cntR = 0;

    // Hitung hanya trip yang selesai (lebih masuk akal untuk operasional)
    for (const agg of tripMap.values()) {
      if (!agg.finished) continue;

      if (agg.forwardStart && agg.forwardEnd) {
        const minutes = (agg.forwardEnd.getTime() - agg.forwardStart.getTime()) / 60000;
        if (minutes >= 0) {
          sumF += minutes;
          cntF++;
        }
      }
      if (agg.reverseStart && agg.reverseEnd) {
        const minutes = (agg.reverseEnd.getTime() - agg.reverseStart.getTime()) / 60000;
        if (minutes >= 0) {
          sumR += minutes;
          cntR++;
        }
      }
    }

    const avgForwardMin = cntF ? Math.round((sumF / cntF) * 10) / 10 : 0;
    const avgReverseMin = cntR ? Math.round((sumR / cntR) * 10) / 10 : 0;

    return NextResponse.json({
      ok: true,
      today: {
        completedTrips: completedTripsToday,
      },
      updates24h: {
        total: updates24h.length,
        byHour,
      },
      durationsToday: {
        avgForwardMin,
        avgReverseMin,
        sampleTrips: finishedTripSet.size,
      },
    });
  } catch (err) {
    console.error("GET /api/dashboard/metrics error:", err);
    return NextResponse.json(
      { ok: false, message: "Server error" },
      { status: 500 }
    );
  }
}
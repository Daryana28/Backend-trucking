// src/app/api/driver-status/history/route.ts

// src/app/api/driver-status/history/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const driverId = url.searchParams.get("driverId") ?? "";
    const limitStr = url.searchParams.get("limit") ?? "60";
    const limit = Math.max(2, Math.min(200, Number(limitStr) || 60));

    if (!driverId) {
      return NextResponse.json({ ok: false, points: [] }, { status: 200 });
    }

    // Ambil titik terbaru untuk driver ini, lalu kita balik urutannya agar jadi oldest -> newest
    const rows = await prisma.driverStatus.findMany({
      where: {
        driverId,
        lat: { not: null },
        lng: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        lat: true,
        lng: true,
        updatedAt: true,
      },
    });

    const points = rows
      .slice()
      .reverse()
      .map((r) => ({
        lat: r.lat as number,
        lng: r.lng as number,
        // kirim ISO string biar bisa dipakai di OSRM timestamps
        t: new Date(r.updatedAt).toISOString(),
      }));

    return NextResponse.json({ ok: true, points }, { status: 200 });
  } catch (e) {
    console.error("driver-status/history error:", e);
    return NextResponse.json({ ok: false, points: [] }, { status: 200 });
  }
}
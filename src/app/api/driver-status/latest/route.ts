// src/app/api/driver-status/latest/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  // ambil semua status driver (terbaru duluan)
  const statuses = await prisma.driverStatus.findMany({
    orderBy: { updatedAt: "desc" },
    include: { driver: true },
  });

  // ambil 1 status terbaru per driver
  const map = new Map<string, (typeof statuses)[number]>();

  for (const s of statuses) {
    if (!map.has(s.driverId)) {
      map.set(s.driverId, s);
    }
  }

  const latest = Array.from(map.values()).filter(
    (s) => s.lat !== null && s.lng !== null
  );

  return NextResponse.json(latest);
}

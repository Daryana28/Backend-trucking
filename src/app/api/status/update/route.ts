// src/app/api/status/update/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDriverFromAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const driver = await getDriverFromAuth(req);
    if (!driver) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json()) ?? {};
    const { plate, origin, destination, etdTime, etaTime, direction } = body;

    const dir: "forward" | "reverse" =
      direction === "reverse" ? "reverse" : "forward";

    // Ambil status terakhir driver (semua direction) berdasarkan updatedAt
    const last = await prisma.driverStatus
      .findMany({
        where: { driverId: driver.id },
        orderBy: { updatedAt: "desc" },
        take: 1,
      })
      .then((rows) => rows[0] || null);

    // Tentukan perlu trip baru?
    let makeNewTrip = false;
    if (!last) makeNewTrip = true;
    if (plate && plate !== last?.plate) makeNewTrip = true;
    if (last?.isFinished && (etdTime || etaTime || plate || destination)) {
      makeNewTrip = true;
    }

    let tripGroup = last?.tripGroup || "";
    if (!last || makeNewTrip) {
      tripGroup = `trip_${driver.id}_${Date.now()}`;
    }

    // Ambil status terakhir untuk tripGroup + direction yang sama
    let lastSameDir = null as any;
    if (!makeNewTrip) {
      lastSameDir = await prisma.driverStatus
        .findMany({
          where: { driverId: driver.id, tripGroup, direction: dir },
          orderBy: { updatedAt: "desc" },
          take: 1,
        })
        .then((rows) => rows[0] || null);
    }

    const finalPlate = plate ?? lastSameDir?.plate ?? last?.plate ?? null;
    const finalOrigin = origin ?? lastSameDir?.origin ?? last?.origin ?? null;
    const finalDestination =
      destination ?? lastSameDir?.destination ?? last?.destination ?? null;
    const finalEtd = etdTime ?? lastSameDir?.etdTime ?? null;
    const finalEta = etaTime ?? lastSameDir?.etaTime ?? null;

    // Trip dianggap selesai hanya ketika reverse sudah punya ETD & ETA
    const isFinished = dir === "reverse" && Boolean(finalEtd && finalEta);

    const status = await prisma.driverStatus.create({
      data: {
        driverId: driver.id,
        plate: finalPlate,
        origin: finalOrigin,
        destination: finalDestination,
        etdTime: finalEtd,
        etaTime: finalEta,
        direction: dir,
        tripGroup,
        isFinished,
      },
    });

    return NextResponse.json({ success: true, status }, { status: 200 });
  } catch (err) {
    console.error("POST /api/status/update error", err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

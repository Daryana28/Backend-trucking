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

    const { plate, destination, etdTime, etaTime, direction } =
      await req.json();

    const dir = direction || "forward";

    // === Ambil status terakhir sesuai direction ===
    const last = await prisma.driverStatus.findFirst({
      where: {
        driverId: driver.id,
        direction: dir, // ⭐ FIX UTAMA
      },
      orderBy: { updatedAt: "desc" },
    });

    // === Gunakan nilai lama bila tidak dikirim ===
    let finalPlate = plate ?? last?.plate ?? null;
    let finalDestination = destination ?? last?.destination ?? null;
    let finalEtd = etdTime ?? last?.etdTime ?? null;
    let finalEta = etaTime ?? last?.etaTime ?? null;

    // === Tetapkan direction dengan BENAR ===
    const finalDirection = dir;

    // === Cek apakah perlu trip baru ===
    let makeNewTrip = false;

    // 1. Tidak ada trip sebelumnya
    if (!last) makeNewTrip = true;

    // 2. Plate berubah → mulai trip baru
    if (plate && plate !== last?.plate) {
      finalEtd = null;
      finalEta = null;
      makeNewTrip = true;
    }

    // 3. Trip sebelumnya FINISH → update baru ⇒ trip baru
    if (last?.isFinished && (etdTime || etaTime)) {
      makeNewTrip = true;
    }

    // === TRIP GROUP HARUS BERDASARKAN direction ===
    const tripGroup = makeNewTrip
      ? `trip_${driver.id}_${finalDirection}_${Date.now()}` // ⭐ perbedaan jelas
      : last!.tripGroup;

    // Status complete bila ETD & ETA ada
    const isFinished = Boolean(finalEtd && finalEta);

    // === SIMPAN RECORD ===
    const status = await prisma.driverStatus.create({
      data: {
        driverId: driver.id,
        plate: finalPlate,
        destination: finalDestination,
        etdTime: finalEtd,
        etaTime: finalEta,
        direction: finalDirection, // ⭐ WAJIB
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

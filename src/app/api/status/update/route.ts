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

    // === Ambil status terakhir ===
    const last = await prisma.driverStatus.findFirst({
      where: { driverId: driver.id },
      orderBy: { updatedAt: "desc" },
    });

    // === Gunakan nilai lama bila tidak dikirim ===
    let finalPlate = plate ?? last?.plate ?? null;
    let finalDirection = direction ?? last?.direction ?? "forward";
    let finalDestination = destination ?? last?.destination ?? null;

    // ETD / ETA TIDAK BOLEH HILANG kalau tidak ada input baru
    let finalEtd = etdTime ?? last?.etdTime ?? null;
    let finalEta = etaTime ?? last?.etaTime ?? null;

    // === Kalau PLAT BERUBAH → TRIP BARU + reset ETD & ETA ===
    let makeNewTrip = false;

    if (plate && plate !== last?.plate) {
      finalEtd = null;
      finalEta = null;
      makeNewTrip = true;
    }

    // === Kalau belum ada record, wajib new trip ===
    if (!last) makeNewTrip = true;

    // === Kalau trip sebelumnya FINISH, dan mobile kirim ETA/ETD baru → trip baru ===
    if (last?.isFinished && (etdTime || etaTime)) {
      makeNewTrip = true;
    }

    // === Tetap lanjutkan TRIP sama bila hanya update ETA/Etd ===
    const tripGroup = makeNewTrip
      ? `trip_${driver.id}_${Date.now()}`
      : last?.tripGroup ?? `trip_${driver.id}_${Date.now()}`;

    // STATUS COMPLETE hanya bila ETD ADA & ETA ADA
    const isFinished = Boolean(finalEtd && finalEta);

    // === SIMPAN ===
    const status = await prisma.driverStatus.create({
      data: {
        driverId: driver.id,
        plate: finalPlate,
        destination: finalDestination,
        etdTime: finalEtd,
        etaTime: finalEta,
        direction: finalDirection,
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

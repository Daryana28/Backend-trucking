// app/api/status/update/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDriverFromAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const driver = await getDriverFromAuth(req);
    if (!driver) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const { plate, destination, etdTime, etaTime } = await req.json();

    // 🚀 UPDATE LOGIC: JANGAN SELALU BUAT TRIP BARU
    const last = await prisma.driverStatus.findFirst({
      where: { driverId: driver.id },
      orderBy: { updatedAt: "desc" },
    });

    // Gunakan data lama jika mobile tidak mengirim
    const finalPlate = plate ?? last?.plate ?? null;
    const finalDestination = destination ?? last?.destination ?? null;

    // ETD/ETA hanya diisi jika dikirim (tidak reset)
    const finalEtd = etdTime ?? last?.etdTime ?? null;
    const finalEta = etaTime ?? last?.etaTime ?? null;

    // Status selesai hanya jika ETD & ETA sudah ada semua
    const isFinished = Boolean(finalEtd && finalEta);

    // Tentukan tripGroup (baru jika plate berubah atau trip sebelumnya selesai)
    const newTrip =
      !last ||
      last.plate !== finalPlate ||
      last.isFinished;

    const tripGroup = newTrip
      ? `trip_${driver.id}_${Date.now()}`
      : last!.tripGroup;

    const status = await prisma.driverStatus.create({
      data: {
        driverId: driver.id,
        plate: finalPlate,
        destination: finalDestination,
        etdTime: finalEtd,
        etaTime: finalEta,
        tripGroup,
        isFinished,
      },
    });

    return NextResponse.json(
      { success: true, status },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("POST /api/status/update error", err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

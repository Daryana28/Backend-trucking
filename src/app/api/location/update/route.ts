// src/app/api/location/update/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { driverId, latitude, longitude, heading, speed, timestamp } =
      await req.json();

    // Validasi input
    if (!driverId || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Cari TruckUsage aktif untuk driver ini
    const activeTruckUsage = await prisma.truckUsage.findFirst({
      where: { driverId },
      orderBy: { startedAt: "desc" },
    });

    if (activeTruckUsage) {
      // Update lokasi di TruckUsage yang aktif
      await prisma.truckUsage.update({
        where: { id: activeTruckUsage.id },
        data: {
          lat: parseFloat(latitude),
          lng: parseFloat(longitude),
          heading: heading ? parseFloat(heading) : null,
          speed: speed ? parseFloat(speed) : null,
          updatedAt: new Date(timestamp),
        },
      });

      return NextResponse.json({
        success: true,
        message: "Location updated successfully",
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "No active truck usage found for this driver",
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("Location update error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

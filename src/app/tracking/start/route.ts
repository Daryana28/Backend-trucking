// src/app/tracking/start/route.ts
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDriverFromAuth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { truckId } = await req.json();
    const driver = await getDriverFromAuth(req);

    if (!driver) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!truckId) {
      return NextResponse.json(
        { error: "truckId wajib dikirim" },
        { status: 400 }
      );
    }

    const session = await prisma.truckUsage.create({
      data: {
        driverId: driver.id,
        truckId,
      },
    });

    return NextResponse.json({ ok: true, sessionId: session.id });
  } catch (err) {
    console.error("POST /tracking/start error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

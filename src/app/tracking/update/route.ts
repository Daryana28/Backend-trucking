import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { sessionId, lat, lng, speed, heading } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // update posisi terakhir
    const updated = await prisma.truckUsage.update({
      where: { id: sessionId },
      data: {
        lat,
        lng,
        speed,
        heading,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const route = await prisma.route.findFirst({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ route });
  } catch (err) {
    console.error("ROUTE FETCH ERROR", err);
    return NextResponse.json({ route: null });
  }
}
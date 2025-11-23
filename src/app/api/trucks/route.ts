import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const trucks = await prisma.truck.findMany({
    orderBy: { plate: "asc" }
  });
  return NextResponse.json(trucks);
}
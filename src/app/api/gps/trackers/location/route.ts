import { NextResponse } from "next/server";
import { accugpsFetch } from "@/lib/accugps";

export const dynamic = "force-dynamic";

// cache sederhana di memory (dev-friendly)
let lastFetch = 0;
let lastData: any = null;
const TTL = 10_000; // 10 detik

export async function GET() {
  const now = Date.now();

  // kalau masih dalam TTL, balikin cache
  if (lastData && now - lastFetch < TTL) {
    return NextResponse.json(lastData);
  }

  try {
    const data = await accugpsFetch<any>("/api/open/v1/trackers/location");

    lastFetch = now;
    lastData = data;

    return NextResponse.json(data);
  } catch (e: any) {
    // kalau kena 429, balikin cache terakhir
    if (e?.message?.includes("429") && lastData) {
      return NextResponse.json(lastData);
    }

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { dayRangeEpochSecJakarta } from "@/lib/actualTrips";
import { syncActualTrips } from "@/lib/actualSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickDateFromQuery(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("date") || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return dayRangeEpochSecJakarta(null).ymd;
}

export async function GET(req: Request) {
  try {
    const dateYmd = pickDateFromQuery(req);
    const data = await syncActualTrips(dateYmd);
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    console.error("actual sync error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

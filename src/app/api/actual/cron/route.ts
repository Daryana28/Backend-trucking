import { NextResponse } from "next/server";
import { startActualSyncCron } from "@/lib/actualSyncCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    startActualSyncCron();
    return NextResponse.json({ ok: true, started: true });
  } catch (e: any) {
    console.error("actual cron start error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

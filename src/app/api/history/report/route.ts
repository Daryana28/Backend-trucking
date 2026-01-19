// src/app/api/history/report/route.ts

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Placeholder endpoint to avoid 404 in dashboard.
  // TODO: replace with real history aggregation when available.
  return NextResponse.json({ ok: true, data: [] }, { status: 200 });
}

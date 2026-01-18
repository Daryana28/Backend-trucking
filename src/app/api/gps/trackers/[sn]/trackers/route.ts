// src/app/api/gps/trackers/[sn]/trackers/route.ts

import { NextResponse } from "next/server";
import { accugpsFetch } from "@/lib/accugps";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ sn: string }> }) {
  try {
    const { sn } = await ctx.params;
    const { searchParams } = new URL(req.url);

    // PDF: timestamps UTC unix seconds  [oai_citation:12‡AccuGPS_Device_Open_API.pdf](sediment://file_000000008a8c7208a323511c9516aeba)
    const start_time = searchParams.get("start_time");
    const end_time = searchParams.get("end_time");

    if (!start_time || !end_time) {
      return NextResponse.json(
        { ok: false, error: "start_time & end_time wajib (unix timestamp detik, UTC)" },
        { status: 400 }
      );
    }

    // PDF: GET "/api/open/v1/trackers/{sn}/track?start_time=...&end_time=..."  [oai_citation:13‡AccuGPS_Device_Open_API.pdf](sediment://file_000000008a8c7208a323511c9516aeba)
    const qs = new URLSearchParams({ start_time, end_time }).toString();
    const data = await accugpsFetch<any>(
      `/api/open/v1/trackers/${encodeURIComponent(sn)}/track?${qs}`
    );

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown" }, { status: 500 });
  }
}
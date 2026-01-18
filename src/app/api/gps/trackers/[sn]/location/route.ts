// src/app/api/gps/trackers/[sn]/location/route.ts

import { NextResponse } from "next/server";
import { accugpsFetch } from "@/lib/accugps";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sn: string }> },
) {
  try {
    const { sn } = await ctx.params;
    // PDF: GET "/api/open/v1/trackers/{sn}/location"  [oai_citation:11‡AccuGPS_Device_Open_API.pdf](sediment://file_000000008a8c7208a323511c9516aeba)
    const data = await accugpsFetch<any>(
      `/api/open/v1/trackers/${encodeURIComponent(sn)}/location`,
    );
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown" },
      { status: 500 },
    );
  }
}

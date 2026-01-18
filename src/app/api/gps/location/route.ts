import { NextResponse } from "next/server";
import { accugpsFetch } from "@/lib/accugps";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // PDF: GET "/api/open/v1/trackers/location"  [oai_citation:10‡AccuGPS_Device_Open_API.pdf](sediment://file_000000008a8c7208a323511c9516aeba)
    const data = await accugpsFetch<any>("/api/open/v1/trackers/location");
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown" },
      { status: 500 }
    );
  }
}

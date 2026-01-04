import { NextResponse } from "next/server";
import { buildPlanTemplateXlsxBuffer } from "@/lib/planExcel";

export const runtime = "nodejs";

export async function GET() {
  const buf = buildPlanTemplateXlsxBuffer();

  // ✅ Buffer -> Uint8Array biar NextResponse nerima
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plan_template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

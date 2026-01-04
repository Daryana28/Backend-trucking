import { NextResponse } from "next/server";
import { buildPlanTemplateXlsxBuffer } from "@/lib/planExcel";

export const runtime = "nodejs";

export async function GET() {
  const buf = buildPlanTemplateXlsxBuffer();

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plan_template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

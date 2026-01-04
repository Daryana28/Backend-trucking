import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePlanXlsx } from "@/lib/planExcel";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "File tidak ditemukan. Kirim dengan key: file" },
        { status: 400 }
      );
    }

    const ab = await file.arrayBuffer();
    const { rows, errors } = parsePlanXlsx(ab);

    if (errors.length) {
      return NextResponse.json({ ok: false, errors }, { status: 400 });
    }

    await prisma.$transaction(
      rows.map((r) =>
        prisma.planDaily.upsert({
          where: {
            uniq_plan_daily_date_destination: {
              deliveryDate: r.deliveryDate,
              destination: r.destination,
            },
          },
          create: {
            deliveryDate: r.deliveryDate,
            destination: r.destination,
            group: r.group,
            forwardEtd: r.forwardEtd || null,
            forwardEta: r.forwardEta || null,
            reverseEtd: r.reverseEtd || null,
            reverseEta: r.reverseEta || null,
          },
          update: {
            group: r.group,
            forwardEtd: r.forwardEtd || null,
            forwardEta: r.forwardEta || null,
            reverseEtd: r.reverseEtd || null,
            reverseEta: r.reverseEta || null,
          },
        })
      )
    );

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (e) {
    console.error("POST /api/plan/upload error:", e);
    return NextResponse.json(
      { ok: false, error: "Upload gagal. Pastikan file xlsx valid." },
      { status: 500 }
    );
  }
}

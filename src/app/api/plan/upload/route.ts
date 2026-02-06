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

    const uniqueDates = Array.from(
      new Set(rows.map((r) => String(r.deliveryDate ?? "").trim()).filter(Boolean)),
    ).sort();

    await prisma.$transaction(async (tx) => {
      if (uniqueDates.length) {
        await tx.planDaily.deleteMany({
          where: { deliveryDate: { in: uniqueDates } },
        });
      }
      await tx.planDaily.createMany({
        data: rows.map((r) => ({
          deliveryDate: r.deliveryDate,
          destination: r.destination,
          group: r.group,
          tripNo: r.tripNo,
          tripCount: r.tripCount ?? 0,
          forwardEtd: r.forwardEtd || null,
          forwardEta: r.forwardEta || null,
          reverseEtd: r.reverseEtd || null,
          reverseEta: r.reverseEta || null,
        })),
      });
    });

    return NextResponse.json({
      ok: true,
      count: rows.length,
      dates: uniqueDates,
    });
  } catch (e) {
    console.error("POST /api/plan/upload error:", e);
    return NextResponse.json(
      { ok: false, error: "Upload gagal. Pastikan file xlsx valid." },
      { status: 500 }
    );
  }
}

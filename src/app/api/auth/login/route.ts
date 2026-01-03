// src/app/api/auth/login/route.ts

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
// ✅ Pastikan bcrypt jalan di Node runtime
export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const nameRaw = body?.name;
    const passwordRaw = body?.password;

    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const password = typeof passwordRaw === "string" ? passwordRaw : "";

    if (!name || !password) {
      return NextResponse.json(
        { success: false, message: "Nama & password wajib diisi" },
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ cari driver berdasarkan nama (lebih aman untuk beda kapital/spasi)
    const driver = await prisma.driver.findFirst({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
    });

    if (!driver) {
      return NextResponse.json(
        { success: false, message: "Nama tidak ditemukan" },
        { status: 404, headers: corsHeaders }
      );
    }

    // ✅ Guard: di DB lokal kadang password belum keisi / beda seed
    if (!driver.password || typeof driver.password !== "string") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Password driver belum terset di database. Pastikan data lokal sudah di-seed & password tersimpan hash bcrypt.",
        },
        { status: 500, headers: corsHeaders }
      );
    }

    // cek password
    const match = await bcrypt.compare(password, driver.password);
    if (!match) {
      return NextResponse.json(
        { success: false, message: "Password salah" },
        { status: 401, headers: corsHeaders }
      );
    }

    // buat token JWT
    const token = signToken(driver.id);

    return NextResponse.json(
      {
        success: true,
        token,
        driver,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    console.error("POST /api/auth/login ERROR:", e);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

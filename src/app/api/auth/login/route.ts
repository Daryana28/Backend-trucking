// src/app/api/auth/login/route.ts

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
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

    const input = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const password = typeof passwordRaw === "string" ? passwordRaw : "";

    if (!input || !password) {
      return NextResponse.json(
        { success: false, message: "Nama/Phone & password wajib diisi" },
        { status: 400, headers: corsHeaders }
      );
    }

    const phoneCandidate = input.replace(/\s+/g, "");

    // ✅ 1) coba cari berdasarkan PHONE dulu (unique, paling aman)
    let driver = await prisma.driver.findUnique({
      where: { phone: phoneCandidate },
    });

    // ✅ 2) fallback: cari berdasarkan NAME (insensitive)
    if (!driver) {
      driver = await prisma.driver.findFirst({
        where: {
          name: {
            equals: input,
            mode: "insensitive",
          },
        },
      });
    }

    if (!driver) {
      return NextResponse.json(
        { success: false, message: "Akun tidak ditemukan" },
        { status: 404, headers: corsHeaders }
      );
    }

    if (!driver.password || typeof driver.password !== "string") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Password driver belum terset di database. Pastikan password tersimpan hash bcrypt.",
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const match = await bcrypt.compare(password, driver.password);
    if (!match) {
      return NextResponse.json(
        { success: false, message: "Password salah" },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = signToken(driver.id);

    // ✅ jangan kirim password hash ke mobile
    const { password: _pw, ...safeDriver } = driver as any;

    return NextResponse.json(
      {
        success: true,
        token,
        driver: safeDriver,
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

// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
    const { name, password } = await req.json();

    if (!name || !password) {
      return NextResponse.json(
        { success: false, message: "Nama & password wajib diisi" },
        { status: 400, headers: corsHeaders }
      );
    }

    // cari driver berdasarkan nama
    const driver = await prisma.driver.findFirst({
      where: { name },
    });

    if (!driver) {
      return NextResponse.json(
        { success: false, message: "Nama tidak ditemukan" },
        { status: 404, headers: corsHeaders }
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

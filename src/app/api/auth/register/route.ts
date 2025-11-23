// src/app/api/auth/register/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { name, phone, password } = await req.json();

    // Validasi
    if (!name || !phone || !password) {
      return NextResponse.json(
        { success: false, message: "Name, phone, and password are required" },
        { status: 400 }
      );
    }

    // Cek nomor sudah terdaftar
    const existing = await prisma.driver.findFirst({
      where: { phone },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, message: "Driver sudah terdaftar" },
        { status: 400 }
      );
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Buat driver baru
    const newDriver = await prisma.driver.create({
      data: {
        name,
        phone,
        password: hash,
      },
    });

    return NextResponse.json(
      { success: true, driver: newDriver },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
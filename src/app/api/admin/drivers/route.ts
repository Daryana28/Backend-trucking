// src/app/api/admin/drivers/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // ✅ penting agar aman (dan konsisten)

async function requireAdmin() {
  const cookieStore = await cookies();
  const adminId = cookieStore.get("admin_auth")?.value;

  if (!adminId) return null;

  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, username: true },
  });

  return admin ?? null;
}

// GET: list driver (tanpa password)
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const drivers = await prisma.driver.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    });

    return NextResponse.json({ ok: true, drivers });
  } catch (e) {
    console.error("GET /admin/drivers error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST: create driver
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const phoneRaw = String(body?.phone ?? "").trim();
    const passwordPlain = String(body?.password ?? "").trim();

    if (!name || !phoneRaw || !passwordPlain) {
      return NextResponse.json(
        { error: "Name, phone, password wajib diisi" },
        { status: 400 }
      );
    }

    // normalisasi phone sederhana (hapus spasi)
    const phone = phoneRaw.replace(/\s+/g, "");

    // cek duplicate phone
    const exists = await prisma.driver.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (exists) {
      return NextResponse.json(
        { error: "Nomor HP sudah terdaftar" },
        { status: 409 }
      );
    }

    // bcrypt hash => format $2a/$2b... (bcryptjs juga kompatibel untuk compare)
    const hashed = await bcrypt.hash(passwordPlain, 10);

    const created = await prisma.driver.create({
      data: { name, phone, password: hashed },
      select: { id: true, name: true, phone: true },
    });

    return NextResponse.json({ ok: true, driver: created }, { status: 201 });
  } catch (e) {
    console.error("POST /admin/drivers error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// src/app/api/admin/login/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma"; // pakai prisma.ts yg sudah kamu punya

export async function POST(req: Request) {
  const { username, password } = await req.json();

  // cari admin berdasarkan username di DB
  const admin = await prisma.admin.findUnique({
    where: { username },
  });

  // kalau tidak ada atau password tidak sama -> gagal
  if (!admin || admin.password !== password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // login sukses -> set cookie seperti sebelumnya
  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        // boleh isi id / username, yg penting cuma penanda "sudah login"
        "Set-Cookie": `admin_auth=${admin.id}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`,
      },
    }
  );
}

// src/app/api/admin/login/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "").trim();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username & password wajib diisi" },
        { status: 400 }
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { username },
    });

    // ✅ only change: compare password with bcrypt hash
    const isValid = admin?.password
      ? await bcrypt.compare(password, admin.password)
      : false;

    if (!admin || !isValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // ✅ penting untuk HTTPS
    const isProd = process.env.NODE_ENV === "production";
    const cookie = [
      `admin_auth=${admin.id}`,
      "Path=/",
      "HttpOnly",
      "Max-Age=86400",
      "SameSite=Lax",
      ...(isProd ? ["Secure"] : []),
    ].join("; ");

    return NextResponse.json(
      { ok: true, admin: { id: admin.id, username: admin.username } },
      { status: 200, headers: { "Set-Cookie": cookie } }
    );
  } catch (e) {
    console.error("admin login error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

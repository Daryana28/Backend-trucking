// src/app/api/auth/logout/route.ts

import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ success: true });

  // 🔥 HAPUS COOKIE AUTH
  res.cookies.set("asakai_role", "", {
    path: "/",
    expires: new Date(0),
  });

  // kalau kamu punya cookie lain (misalnya token)
  res.cookies.set("admin_token", "", {
    path: "/",
    expires: new Date(0),
  });

  return res;
}

// OPTIONAL: support GET (fallback)
export async function GET() {
  const res = NextResponse.redirect(
    new URL(
      "/login",
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    )
  );

  res.cookies.set("asakai_role", "", {
    path: "/",
    expires: new Date(0),
  });

  res.cookies.set("admin_token", "", {
    path: "/",
    expires: new Date(0),
  });

  return res;
}

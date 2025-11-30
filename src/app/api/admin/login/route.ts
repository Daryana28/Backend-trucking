// src/app/api/admin/login/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { username, password } = body;

  // Login khusus web admin
  if (username === "logistic" && password === "123456") {
    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: {
          "Set-Cookie": `admin_auth=1; Path=/; HttpOnly; Max-Age=86400`,
        },
      }
    );
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}

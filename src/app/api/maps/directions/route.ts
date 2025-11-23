// src/app/api/maps/directions/route.ts
import { NextResponse } from "next/server";

const GOOGLE_DIRECTIONS_KEY = process.env.GOOGLE_MAPS_SERVER_KEY;

export async function GET(req: Request) {
  try {
    if (!GOOGLE_DIRECTIONS_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_MAPS_SERVER_KEY belum di-set" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const origin = searchParams.get("origin");
    const destination = searchParams.get("destination");

    if (!origin || !destination) {
      return NextResponse.json(
        { error: "origin & destination wajib diisi" },
        { status: 400 }
      );
    }

    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    url.searchParams.set("key", GOOGLE_DIRECTIONS_KEY);
    url.searchParams.set("mode", "driving");

    const res = await fetch(url.toString());
    const json = await res.json();

    if (!json.routes?.length) {
      return NextResponse.json(
        { error: "Route not found", raw: json },
        { status: 404 }
      );
    }

    const points = json.routes[0].overview_polyline.points;

    return NextResponse.json({ points });
  } catch (err) {
    console.error("GET /api/maps/directions error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

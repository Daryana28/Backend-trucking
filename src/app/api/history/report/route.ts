// src/app/api/history/report/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Query params:
 * - q: keyword cari (plate / driver / tujuan / origin)
 * - plate: filter plate contains
 * - driverId: filter driverId
 * - dateFrom: YYYY-MM-DD (inclusive, WIB)
 * - dateTo: YYYY-MM-DD (inclusive, WIB)
 * - complete: "true" | "false" | "all"
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const plate = (searchParams.get("plate") ?? "").trim();
  const driverId = (searchParams.get("driverId") ?? "").trim();

  const dateFrom = (searchParams.get("dateFrom") ?? "").trim();
  const dateTo = (searchParams.get("dateTo") ?? "").trim();
  const complete = (searchParams.get("complete") ?? "all").trim(); // all|true|false

  // ✅ range updatedAt (WIB) - supaya filter tanggal sesuai Indonesia
  const fromDt = dateFrom ? new Date(`${dateFrom}T00:00:00+07:00`) : null;
  const toDt = dateTo ? new Date(`${dateTo}T23:59:59.999+07:00`) : null;

  // ✅ ambil statuses (pakai filter yang aman & ringan)
  // NOTE: orderBy asc penting untuk ambil status terakhir per direction
  const statuses = await prisma.driverStatus.findMany({
    where: {
      ...(driverId ? { driverId } : {}),
      ...(plate ? { plate: { contains: plate, mode: "insensitive" } } : {}),
      ...(fromDt || toDt
        ? {
            updatedAt: {
              ...(fromDt ? { gte: fromDt } : {}),
              ...(toDt ? { lte: toDt } : {}),
            },
          }
        : {}),
    },
    include: { driver: true },
    orderBy: { updatedAt: "asc" },
    take: 10000, // ✅ batasi biar tidak berat (silakan naik/turun)
  });

  // group by tripGroup + driverId
  const groups = new Map<string, typeof statuses>();

  for (const s of statuses) {
    const key = `${s.tripGroup}__${s.driverId}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  // build rows report
  const rows = Array.from(groups.values())
    .map((arr) => {
      if (!arr.length) return null;

      const forward =
        [...arr].filter((x) => x.direction === "forward").slice(-1)[0] ?? null;
      const reverse =
        [...arr].filter((x) => x.direction === "reverse").slice(-1)[0] ?? null;
      const last = arr[arr.length - 1];

      const isComplete = Boolean(forward?.etaTime && reverse?.etaTime);

      const row = {
        tripGroup: last.tripGroup,
        driverId: last.driverId,
        driverName: last.driver?.name ?? null,
        driverPhone: last.driver?.phone ?? null,

        plate: forward?.plate ?? reverse?.plate ?? last.plate ?? null,

        // rute
        originForward: forward?.origin ?? null,
        destinationForward: forward?.destination ?? null,
        etdForward: forward?.etdTime ?? null,
        etaForward: forward?.etaTime ?? null,

        originReverse: reverse?.origin ?? null,
        destinationReverse: reverse?.destination ?? null,
        etdReverse: reverse?.etdTime ?? null,
        etaReverse: reverse?.etaTime ?? null,

        // meta
        isComplete,
        lastUpdated: last.updatedAt.toISOString(),
      };

      // keyword filter (q)
      if (q) {
        const hay = [
          row.plate,
          row.driverName,
          row.driverPhone,
          row.originForward,
          row.destinationForward,
          row.originReverse,
          row.destinationReverse,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!hay.includes(q.toLowerCase())) return null;
      }

      // complete filter
      if (complete === "true" && !row.isComplete) return null;
      if (complete === "false" && row.isComplete) return null;

      return row;
    })
    .filter(Boolean) as any[];

  // sort terbaru dulu
  rows.sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1));

  return NextResponse.json({ ok: true, data: rows });
}

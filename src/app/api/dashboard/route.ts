// src/app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  accugpsListTrackers,
  accugpsTrackersLocation,
  accugpsTrackerAlerts,
  normalizeCoord,
} from "@/lib/accugps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// master customer by plate (samakan dengan RealtimeMap)
const CUSTOMER_BY_PLATE: Record<string, string> = {
  "T 9521 AB": "Yamaha Pulogadung Lokal",
  "T 9473 AB": "Yamaha Karawang",
  "T 8854 DH": "Yamaha Pg export",
  "T 9508 AB": "Yamaha Karawang",
  "T 9472 AB": "Yamaha Pulogadung Lokal",
};

function normalizePlate(input?: string | null) {
  if (!input) return "";
  const raw = String(input).trim();
  const beforeDash = raw.split("-")[0]?.trim() ?? raw;
  return beforeDash.replace(/\s+/g, " ").toUpperCase();
}

function customerFromPlate(plate?: string | null) {
  const k = normalizePlate(plate);
  return CUSTOMER_BY_PLATE[k] ?? "-";
}

function todayJakartaYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function todayRangeEpochSecJakarta() {
  const ymd = todayJakartaYmd();
  const start = new Date(`${ymd}T00:00:00+07:00`).getTime();
  const end = new Date(`${ymd}T23:59:59+07:00`).getTime();
  return { startSec: Math.floor(start / 1000), endSec: Math.floor(end / 1000) };
}

function msToKmh(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return 0;
  return Math.round(n * 3.6 * 10) / 10;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const qDate = (url.searchParams.get("deliveryDate") ?? "").trim();
    const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(qDate)
      ? qDate
      : todayJakartaYmd();

    // 1) plan master (ETD)
    const plans = await prisma.planDaily.findMany({
      where: { deliveryDate },
      orderBy: [{ destination: "asc" }],
      select: {
        deliveryDate: true,
        destination: true,
        group: true,
        forwardEtd: true,
        reverseEtd: true,
      },
    });

    // index plan by group (biar cepat)
    // NOTE: `group` di excel/DB harus konsisten dengan label customer (mis: "Yamaha Karawang")
    const planByGroup = new Map<
      string,
      {
        destination: string;
        forwardEtd?: string | null;
        reverseEtd?: string | null;
      }[]
    >();

    for (const p of plans) {
      const g = String(p.group ?? "").trim();
      if (!g) continue;
      const arr = planByGroup.get(g) ?? [];
      arr.push({
        destination: String(p.destination ?? "").trim(),
        forwardEtd: p.forwardEtd,
        reverseEtd: p.reverseEtd,
      });
      planByGroup.set(g, arr);
    }

    // 2) trackers list untuk id
    const list = await accugpsListTrackers();
    const trackers = list?.data ?? [];
    const idBySn = new Map<string, string>();
    const aliasBySn = new Map<string, string>();
    trackers.forEach((t) => {
      const sn = String(t.sn ?? "").trim();
      const id = String(t.id ?? "").trim();
      const alias = String(t.alias ?? "").trim();
      if (sn && id) idBySn.set(sn, id);
      if (sn && alias) aliasBySn.set(sn, alias);
    });

    // 3) lokasi realtime
    const loc = await accugpsTrackersLocation();
    const rows = loc?.data ?? [];

    // 4) ambil ETA dari alerts (hari ini)
    const { startSec, endSec } = todayRangeEpochSecJakarta();

    // NOTE: ambil alerts (arriving) itu berat, jadi batasi concurrency (batch kecil)
    const BATCH = 5;

    const result: Array<{
      sn: string;
      plate: string | null;
      customer: string;
      lat: number | null;
      lng: number | null;
      speed: number;
      plannedDestination: string | null;
      plannedEtd: string | null;
      plannedReverseEtd: string | null;
      etaTime: string | null;
      arrived: boolean;
    }> = [];

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);

      const out = await Promise.all(
        chunk.map(async (r: any) => {
          const sn = String(r?.sn ?? "").trim();
          const plateRaw = aliasBySn.get(sn) ?? r?.alias ?? r?.plate ?? "";
          const plate = String(plateRaw).trim() ? String(plateRaw).trim() : null;

          // lokasi bisa ada di root (latitude/longitude) atau nested (location.latitude/location.longitude)
          const lat0 =
            typeof r?.latitude === "number"
              ? r.latitude
              : typeof r?.location?.latitude === "number"
              ? r.location.latitude
              : null;
          const lng0 =
            typeof r?.longitude === "number"
              ? r.longitude
              : typeof r?.location?.longitude === "number"
              ? r.location.longitude
              : null;

          const latitude = typeof lat0 === "number" ? normalizeCoord(lat0) : null;
          const longitude = typeof lng0 === "number" ? normalizeCoord(lng0) : null;

          const speedMs =
            (typeof r?.location?.speed === "number"
              ? r.location.speed
              : typeof r?.speed === "number"
              ? r.speed
              : 0) ?? 0;
          const speed = msToKmh(speedMs);

          const customer = customerFromPlate(plate);

          // pilih plan sesuai customer (group). Kalau ada banyak row (PO1/PO2), ambil semua tapi default ambil yang paling awal punya ETD.
          const planCandidates = planByGroup.get(customer) ?? [];
          const planned =
            [...planCandidates]
              .filter((x) => x && (x.forwardEtd || x.reverseEtd))
              .sort((a, b) => String(a.forwardEtd ?? "").localeCompare(String(b.forwardEtd ?? "")))[0] ??
            planCandidates[0] ??
            null;

          // alerts → cari Arriving terbaru (hari ini)
          let etaTime: string | null = null;
          let arrived = false;

          const trackerId = idBySn.get(sn);
          if (trackerId) {
            try {
              const alerts = await accugpsTrackerAlerts(trackerId, startSec, endSec);
              const list = Array.isArray(alerts?.data) ? alerts.data : [];

              // sort by epoch (kalau ada) else by string time
              const arriving = list
                .filter((x: any) =>
                  String(x?.type ?? "")
                    .toLowerCase()
                    .includes("arriv")
                )
                .sort((a: any, b: any) => {
                  const ta =
                    typeof a?.time === "number"
                      ? a.time
                      : typeof a?.timestamp === "number"
                      ? a.timestamp
                      : Date.parse(String(a?.time ?? "")) || 0;
                  const tb =
                    typeof b?.time === "number"
                      ? b.time
                      : typeof b?.timestamp === "number"
                      ? b.timestamp
                      : Date.parse(String(b?.time ?? "")) || 0;
                  return tb - ta;
                });

              if (arriving.length) {
                const t0 = arriving[0]?.time ?? arriving[0]?.timestamp ?? null;
                etaTime = t0 == null ? null : String(t0);
                arrived = true;
              }
            } catch {
              // ignore
            }
          }

          return {
            sn,
            plate,
            customer,
            lat: latitude,
            lng: longitude,
            speed,
            plannedDestination: planned?.destination ?? null,
            plannedEtd: planned?.forwardEtd ?? null,
            plannedReverseEtd: planned?.reverseEtd ?? null,
            etaTime,
            arrived,
          };
        })
      );

      result.push(...out);
    }

    // hanya yang punya koordinat
    const items = result.filter((x) => x.lat != null && x.lng != null);

    return NextResponse.json({
      ok: true,
      deliveryDate,
      planCount: plans.length,
      truckCount: items.length,
      items,
    });
  } catch (e) {
    console.error("GET /api/dashboard error:", e);
    return NextResponse.json(
      { ok: false, error: "Failed to load dashboard" },
      { status: 500 }
    );
  }
}

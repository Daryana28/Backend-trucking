// src/app/api/history/report/route.ts

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { dayRangeEpochSecJakarta, normalizePlate } from "@/lib/actualTrips";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseYmd(v?: string | null) {
  if (!v) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function formatTimeDot(input?: string | null) {
  if (!input) return "-";
  const s = String(input).trim();
  if (!s || s === "-" || s.toLowerCase() === "null") return "-";
  return s.replace(":", ".");
}

function fmtTimeWibFromSec(sec?: number | null) {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return "-";
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function extractPlateFromDestination(dest?: string | null) {
  const s = String(dest ?? "").trim();
  if (!s) return "-";
  const base = s.includes("(") ? s.split("(")[0]!.trim() : s;
  return normalizePlate(base);
}

function parseTimeToMin(input?: string | null) {
  if (!input) return null;
  const s0 = String(input).trim();
  if (!s0 || s0 === "-" || s0.toLowerCase() === "null") return null;
  const m = s0.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function buildTripWindowsFromStops(
  stops: any[],
  gapSec = 4 * 3600,
): Array<{ startSec: number; endSec: number }> {
  const items = (Array.isArray(stops) ? stops : [])
    .filter((s) => s?.isNear && typeof s?.startSec === "number")
    .map((s) => ({
      startSec: s.startSec as number,
      endSec: typeof s?.endSec === "number" ? (s.endSec as number) : s.startSec,
    }))
    .sort((a, b) => a.startSec - b.startSec);
  if (!items.length) return [];
  const trips: Array<{ startSec: number; endSec: number }> = [];
  let curStart = items[0].startSec;
  let curEnd = items[0].endSec;
  let lastStart = items[0].startSec;
  for (let i = 1; i < items.length; i += 1) {
    const it = items[i];
    if (it.startSec - lastStart >= gapSec) {
      trips.push({ startSec: curStart, endSec: curEnd });
      curStart = it.startSec;
      curEnd = it.endSec;
      lastStart = it.startSec;
    } else {
      curEnd = Math.max(curEnd, it.endSec);
      lastStart = it.startSec;
    }
  }
  trips.push({ startSec: curStart, endSec: curEnd });
  return trips;
}

function toCsv(rows: Array<Record<string, string>>) {
  const headers = [
    "deliveryDate",
    "plate",
    "tripIndex",
    "planEtd",
    "planEta",
    "actualEtd",
    "actualEta",
    "delayMin",
    "delayStatus",
  ];
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "json").toLowerCase();
    const fromQ = parseYmd(searchParams.get("from"));
    const toQ = parseYmd(searchParams.get("to"));
    const today = dayRangeEpochSecJakarta(null).ymd;

    const firstActual = await prisma.actualTripDaily.findFirst({
      orderBy: { deliveryDate: "asc" },
      select: { deliveryDate: true },
    });
    const firstPlan = await prisma.planDaily.findFirst({
      orderBy: { deliveryDate: "asc" },
      select: { deliveryDate: true },
    });
    const candidates = [
      fromQ,
      firstActual?.deliveryDate ?? null,
      firstPlan?.deliveryDate ?? null,
    ].filter(Boolean) as string[];
    const from = candidates.length > 0 ? candidates.sort()[0] : today;
    const to = toQ ?? today;

    const plans = await prisma.planDaily.findMany({
      where: { deliveryDate: { gte: from, lte: to } },
    });

    const planMap: Record<string, { etd: string; eta: string }> = {};
    for (const p of plans) {
      const plate = extractPlateFromDestination(p.destination);
      if (!plate || plate === "-") continue;
      const etd = String(p.forwardEtd ?? p.reverseEtd ?? "-");
      const eta = String(p.forwardEta ?? p.reverseEta ?? "-");
      const etdMin = parseTimeToMin(etd);
      const etaMin = parseTimeToMin(eta);
      if (etdMin == null && etaMin == null) continue;
      const key = `${p.deliveryDate}|${plate}`;
      const cur = planMap[key];
      if (!cur) {
        planMap[key] = { etd, eta };
        continue;
      }
      const curEtdMin = parseTimeToMin(cur.etd);
      const curEtaMin = parseTimeToMin(cur.eta);
      if (etdMin != null && (curEtdMin == null || etdMin < curEtdMin)) {
        planMap[key].etd = etd;
      }
      if (etaMin != null && (curEtaMin == null || etaMin < curEtaMin)) {
        planMap[key].eta = eta;
      }
    }

    const actuals = await prisma.actualTripDaily.findMany({
      where: { deliveryDate: { gte: from, lte: to } },
      include: { stops: true },
      orderBy: [{ deliveryDate: "asc" }, { plate: "asc" }],
    });

    const rows: Array<Record<string, string>> = [];
    for (const a of actuals) {
      const plate = normalizePlate(a.plate);
      const plan = planMap[`${a.deliveryDate}|${plate}`] ?? {
        etd: "-",
        eta: "-",
      };
      const windows = buildTripWindowsFromStops(a.stops || []);
      const planEtaMin = parseTimeToMin(plan.eta);
      if (!windows.length) {
      rows.push({
        deliveryDate: a.deliveryDate,
        plate,
        tripIndex: "0",
        planEtd: formatTimeDot(plan.etd),
        planEta: formatTimeDot(plan.eta),
        actualEtd: "-",
        actualEta: "-",
        delayMin: "",
        delayStatus: "NO DATA",
      });
        continue;
      }
      windows.slice(0, 5).forEach((w, idx) => {
        const actualEta = fmtTimeWibFromSec(w.startSec);
        const actualEtaMin = parseTimeToMin(actualEta);
        const delay =
          planEtaMin != null && actualEtaMin != null
            ? Math.max(0, actualEtaMin - planEtaMin)
            : null;
        const delayStatus =
          delay == null ? "NO DATA" : delay >= 30 ? "DELAY" : "ON TIME";
      rows.push({
        deliveryDate: a.deliveryDate,
        plate,
        tripIndex: String(idx + 1),
        planEtd: formatTimeDot(plan.etd),
        planEta: formatTimeDot(plan.eta),
        actualEtd: formatTimeDot(fmtTimeWibFromSec(w.endSec)),
        actualEta: formatTimeDot(actualEta),
        delayMin: delay == null ? "" : String(delay),
        delayStatus,
      });
    });
  }

    if (format === "xlsx") {
    const headers = [
      "deliveryDate",
      "plate",
      "tripIndex",
      "planEtd",
      "planEta",
      "actualEtd",
      "actualEta",
      "delayMin",
      "delayStatus",
    ];
      const sheetData = [
        headers,
        ...rows.map((r) => headers.map((h) => r[h] ?? "")),
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, "History");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename=\"history-${from}_to_${to}.xlsx\"`,
        },
      });
    }

    if (format === "csv") {
      const csv = toCsv(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"history-${from}_to_${to}.csv\"`,
        },
      });
    }

    return NextResponse.json({ ok: true, from, to, rows });
  } catch (e: any) {
    console.error("history report error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}

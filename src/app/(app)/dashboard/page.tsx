// src/app/(app)/dashboard/page.tsx

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type DriverStatus = {
  id: string;
  driverId: string;
  plate: string | null;
  destination: string | null;
  etdTime?: string | null;
  etaTime?: string | null;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  updatedAt: string;

  // ✅ NEW: dari mobile (YYYY-MM-DD)
  deliveryDate?: string | null;

  driver: { name: string; phone?: string | null };
};

type DashboardMetrics = {
  ok: boolean;
  today: { completedTrips: number };
  updates24h: { total: number; byHour: { label: string; value: number }[] };
  durationsToday: {
    avgForwardMin: number;
    avgReverseMin: number;
    sampleTrips: number;
  };
};

type HistoryRow = {
  tripGroup: string;
  driverId: string;
  driverName: string | null;
  driverPhone: string | null;
  plate: string | null;

  // ✅ NEW: dari API report (YYYY-MM-DD)
  deliveryDate?: string | null;

  originForward: string | null;
  destinationForward: string | null;
  etdForward: string | null;
  etaForward: string | null;

  originReverse: string | null;
  destinationReverse: string | null;
  etdReverse: string | null;
  etaReverse: string | null;

  isComplete: boolean;
  lastUpdated: string;
};

function fmtLastUpdate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ✅ Tanggal saja (WIB) dari ISO
function fmtDateWIB(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ✅ Tanggal dari deliveryDate "YYYY-MM-DD" (format Indonesia)
function fmtDeliveryDate(deliveryDate?: string | null) {
  if (!deliveryDate) return "-";
  const s = String(deliveryDate).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s; // fallback: tampilkan apa adanya kalau format beda
  const d = new Date(`${s}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTimeHHmmss(d: Date) {
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ✅ ambil tanggal hari ini versi WIB dalam format YYYY-MM-DD
function todayWIB() {
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

// ✅ kemarin (WIB) format YYYY-MM-DD
function yesterdayWIB() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "01");

  // buat tanggal WIB "hari ini" lalu -1 hari secara aman
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);

  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ================================
// ✅ PLAN MASTER (Forward)
// ================================
const PLAN_BY_DEST: Record<
  string,
  { etd: string; eta: string; group: "YIMM" | "SIM" }
> = {
  "YIMM PG LOKAL PO 1": { etd: "05:00", eta: "08:00", group: "YIMM" },
  "YIMM PG LOKAL PO 2": { etd: "08:00", eta: "13:00", group: "YIMM" },
  "YIMM PG LOKAL PO 3": { etd: "14:00", eta: "19:00", group: "YIMM" },

  "YIMM PG EXPORT C1": { etd: "05:00", eta: "08:00", group: "YIMM" },
  "YIMM PG EXPORT C2": { etd: "13:00", eta: "19:00", group: "YIMM" },

  "YIMM KARAWANG PO 1": { etd: "05:00", eta: "08:00", group: "YIMM" },
  "YIMM KARAWANG PO 2": { etd: "08:00", eta: "13:00", group: "YIMM" },
  "YIMM KARAWANG PO 3": { etd: "14:00", eta: "19:00", group: "YIMM" },

  "SIM CIKARANG C1": { etd: "05:00", eta: "08:00", group: "SIM" },
  "SIM CIKARANG C2": { etd: "12:00", eta: "15:00", group: "SIM" },
  "SIM TAMBUN/VUTEQ": { etd: "10:00", eta: "15:00", group: "SIM" },
};

function parseHHmmToMin(hhmm?: string | null) {
  if (!hhmm) return null;
  const s = hhmm.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

// durasi menit dari ETD -> ETA (kalau lewat tengah malam, tetap aman)
function diffMin(etd?: string | null, eta?: string | null) {
  const a = parseHHmmToMin(etd);
  const b = parseHHmmToMin(eta);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d < 0) d += 24 * 60;
  return d;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
      {children}
    </span>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-50" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
            {value}
          </div>
          {/* <div className="mt-1 text-xs font-medium text-slate-500">{sub}</div> */}
        </div>

        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

/** Line chart via SVG */
function MiniLineChart({
  points,
  height = 240,
  badgeLabel = "Chart",
  minMaxRight,
}: {
  points: { label: string; value: number }[];
  height?: number;
  badgeLabel?: string;
  minMaxRight?: React.ReactNode;
}) {
  const width = 980;
  const padX = 28;
  const padTop = 18;
  const padBottom = 34;

  const values = points.map((p) => p.value);
  const maxV = Math.max(1, ...values);
  const minV = Math.min(0, ...values);

  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  const toX = (i: number) =>
    padX + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
  const toY = (v: number) =>
    padTop + (1 - (v - minV) / (maxV - minV || 1)) * innerH;

  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${toX(i).toFixed(2)} ${toY(p.value).toFixed(2)}`
    )
    .join(" ");

  const areaD = `${d} L ${toX(points.length - 1).toFixed(2)} ${(
    padTop + innerH
  ).toFixed(2)} L ${toX(0).toFixed(2)} ${(padTop + innerH).toFixed(2)} Z`;

  const leftLabel = points[0]?.label ?? "-";
  const rightLabel = points[points.length - 1]?.label ?? "-";

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <Badge>{badgeLabel}</Badge>
        <div className="text-xs font-semibold text-slate-600">
          {minMaxRight ?? (
            <>
              Min: <span className="text-slate-900">{minV}</span> • Max:{" "}
              <span className="text-slate-900">{maxV}</span>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full">
          <g>
            {[0, 1, 2, 3].map((i) => {
              const y = padTop + (i / 3) * innerH;
              return (
                <line
                  key={i}
                  x1={padX}
                  y1={y}
                  x2={padX + innerW}
                  y2={y}
                  stroke="#E5E7EB"
                  strokeWidth="1"
                />
              );
            })}
          </g>

          <g fontSize="12" fill="#64748B" fontWeight="600">
            <text x={padX} y={padTop + 12} textAnchor="start">
              {maxV}
            </text>
            <text x={padX} y={padTop + innerH} textAnchor="start">
              {minV}
            </text>
          </g>

          <path d={areaD} fill="#2563EB" opacity={0.1} />
          <path
            d={d}
            fill="none"
            stroke="#2563EB"
            strokeWidth={3.5}
            strokeLinecap="round"
          />

          {points.map((p, i) => (
            <circle
              key={i}
              cx={toX(i)}
              cy={toY(p.value)}
              r={4.2}
              fill="#2563EB"
              opacity={0.95}
            />
          ))}
        </svg>

        <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ✅ Grafik Plan vs Actual (dual bar)
function PlanVsActualChart({
  rows,
}: {
  rows: {
    destination: string;
    planEtd: string;
    planEta: string;
    planDurMin: number;
    actualAvgMin: number | null;
    actualSample: number;
  }[];
}) {
  const maxV = Math.max(
    1,
    ...rows.map((r) => Math.max(r.planDurMin, r.actualAvgMin ?? 0))
  );

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <Badge>Plan vs Actual</Badge>
        <div className="text-xs font-semibold text-slate-600">
          Durasi (menit)
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
        {rows.length === 0 ? (
          <div className="text-sm font-medium text-slate-500">
            Belum ada data destinasi.
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => {
              const planW = clamp((r.planDurMin / maxV) * 100, 3, 100);
              const actV = r.actualAvgMin ?? 0;
              const actW =
                r.actualAvgMin == null ? 0 : clamp((actV / maxV) * 100, 3, 100);

              return (
                <div key={r.destination} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-slate-900">
                        {r.destination}
                      </div>
                      <div className="text-xs font-semibold text-slate-500">
                        Plan: {r.planEtd} → {r.planEta} ({r.planDurMin}m) •
                        Actual:{" "}
                        {r.actualAvgMin == null
                          ? "-"
                          : `${Math.round(r.actualAvgMin)}m`}{" "}
                        {r.actualAvgMin == null ? "" : `(n=${r.actualSample})`}
                      </div>
                    </div>

                    <div className="shrink-0 text-xs font-bold text-slate-600">
                      {PLAN_BY_DEST[r.destination]?.group ?? ""}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-14 text-[11px] font-extrabold text-slate-600">
                        Plan
                      </div>
                      <div className="flex-1">
                        <div className="h-3.5 overflow-hidden rounded-full border border-slate-200 bg-white">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: `${planW}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-14 text-right text-[11px] font-extrabold text-slate-900">
                        {r.planDurMin}m
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-14 text-[11px] font-extrabold text-slate-600">
                        Actual
                      </div>
                      <div className="flex-1">
                        <div className="h-3.5 overflow-hidden rounded-full border border-slate-200 bg-white">
                          <div
                            className="h-full rounded-full bg-emerald-600"
                            style={{ width: `${actW}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-14 text-right text-[11px] font-extrabold text-slate-900">
                        {r.actualAvgMin == null
                          ? "-"
                          : `${Math.round(r.actualAvgMin)}m`}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 text-xs font-medium text-slate-500">
          {/* * Actual dihitung dari ETD→ETA Forward yang dikirim driver (rata-rata
          per destinasi) untuk tanggal delivery yang dipilih. */}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ✅ filter delivery date untuk Plan vs Actual + History (Complete)
  const [deliveryDateFilter, setDeliveryDateFilter] = useState<string>(
    todayWIB()
  );

  // ✅ filter group destinasi untuk Plan vs Actual
  const [planGroupFilter, setPlanGroupFilter] = useState<
    "ALL" | "YIMM" | "SIM"
  >("ALL");

  // realtime (aktif / on progress)
  const [latest, setLatest] = useState<DriverStatus[]>([]);
  const [series, setSeries] = useState<{ t: string; active: number }[]>([]);
  const tickRef = useRef<string | null>(null);

  // history complete
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);

  // ops metrics
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  const fetchLatest = async () => {
    try {
      setErr(null);
      const res = await fetch("/api/driver-status/latest", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DriverStatus[] = await res.json();
      setLatest(Array.isArray(data) ? data : []);
    } catch {
      setErr("Gagal memuat data realtime (cek server/API).");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (dayArg?: string) => {
    try {
      const day = dayArg ?? deliveryDateFilter ?? todayWIB();
      const res = await fetch(
        `/api/history/report?complete=true&dateFrom=${day}&dateTo=${day}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const json = await res.json();
      const rows = Array.isArray(json?.data) ? (json.data as HistoryRow[]) : [];
      setHistoryRows(rows);
    } catch {
      // silent
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await fetch("/api/dashboard/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DashboardMetrics = await res.json();
      if (json?.ok) setMetrics(json);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchLatest();
    fetchHistory(deliveryDateFilter);
    fetchMetrics();

    const id1 = window.setInterval(fetchLatest, 5000);
    const idH = window.setInterval(
      () => fetchHistory(deliveryDateFilter),
      30000
    );
    const id2 = window.setInterval(fetchMetrics, 30000);
    return () => {
      window.clearInterval(id1);
      window.clearInterval(idH);
      window.clearInterval(id2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ refetch history saat filter delivery date berubah
  useEffect(() => {
    fetchHistory(deliveryDateFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryDateFilter]);

  const activeDrivers = useMemo(() => {
    return latest.filter((d) => d.lat != null && d.lng != null);
  }, [latest]);

  const activeDriversCount = activeDrivers.length;

  const activeTrucksCount = useMemo(() => {
    const set = new Set<string>();
    for (const d of activeDrivers) if (d.plate) set.add(d.plate);
    return set.size;
  }, [activeDrivers]);

  const lastUpdateIso = useMemo(() => {
    let max: string | null = null;
    for (const d of activeDrivers)
      if (!max || d.updatedAt > max) max = d.updatedAt;
    return max;
  }, [activeDrivers]);

  // realtime series (30 titik)
  useEffect(() => {
    const now = new Date();
    const key = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    if (tickRef.current === key) return;
    tickRef.current = key;

    setSeries((prev) => {
      const next = [
        ...prev,
        { t: fmtTimeHHmmss(now), active: activeDriversCount },
      ];
      return next.length > 30 ? next.slice(next.length - 30) : next;
    });
  }, [activeDriversCount]);

  const realtimeLinePoints = useMemo(
    () => series.map((p) => ({ label: p.t, value: p.active })),
    [series]
  );

  // ops charts data
  const updatesByHour = metrics?.updates24h?.byHour ?? [];

  // ✅ PLAN vs ACTUAL per destinasi (Forward) berdasarkan historyRows (yang sudah ter-filter tanggal)
  // ✅ + tambahan filter group (ALL / YIMM / SIM)
  const planVsActualRows = useMemo(() => {
    const dests = Object.keys(PLAN_BY_DEST).filter((dest) => {
      const g = PLAN_BY_DEST[dest]?.group;
      if (planGroupFilter === "ALL") return true;
      return g === planGroupFilter;
    });

    const buckets = new Map<string, number[]>();
    for (const r of historyRows) {
      const dest = (r.destinationForward ?? "").trim();
      if (!dest || !PLAN_BY_DEST[dest]) continue;

      // ✅ kalau group filter bukan ALL, skip yang beda group
      const g = PLAN_BY_DEST[dest]?.group;
      if (planGroupFilter !== "ALL" && g !== planGroupFilter) continue;

      const dur = diffMin(r.etdForward, r.etaForward);
      if (dur == null) continue;
      const arr = buckets.get(dest) ?? [];
      arr.push(dur);
      buckets.set(dest, arr);
    }

    return dests
      .map((dest) => {
        const plan = PLAN_BY_DEST[dest];
        const planDur = diffMin(plan.etd, plan.eta) ?? 0;

        const arr = buckets.get(dest) ?? [];
        const avg =
          arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

        return {
          destination: dest,
          planEtd: plan.etd,
          planEta: plan.eta,
          planDurMin: planDur,
          actualAvgMin: avg,
          actualSample: arr.length,
        };
      })
      .sort((a, b) => a.destination.localeCompare(b.destination));
  }, [historyRows, planGroupFilter]);

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-slate-50">
      <div className="w-full px-3 md:px-4 lg:px-6 xl:px-8 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-extrabold tracking-tight text-slate-900">
              Dashboard Operasional
            </div>
            <div className="text-sm font-medium text-slate-600">{/* li */}</div>
          </div>

          <div className="flex items-center gap-2">
            {/* {err ? (
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                {err}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Live • realtime 
              </span>
            )} */}
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Active Trucks"
            value={loading ? "-" : activeTrucksCount}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 7h11v10H3z" />
                <path d="M14 10h4l3 3v4h-7z" />
                <path d="M7 17a2 2 0 1 0 4 0" />
                <path d="M16 17a2 2 0 1 0 4 0" />
              </svg>
            }
          />

          <StatCard
            title="Active Drivers"
            value={loading ? "-" : activeDriversCount}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
                <path d="M12 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              </svg>
            }
          />

          <StatCard
            title="Trip Selesai (Hari ini)"
            value={metrics ? metrics.today.completedTrips : "-"}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M20 6 9 17l-5-5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />

          <StatCard
            title="Last Update"
            value={loading ? "-" : fmtLastUpdate(lastUpdateIso)}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 8v5l3 2" />
                <path d="M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z" />
              </svg>
            }
          />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-900">
                  Active Drivers (Realtime)
                </div>
                <div className="text-xs font-medium text-slate-600"></div>
              </div>
              <Badge>{activeDriversCount} driver</Badge>
            </div>

            <div className="mt-4">
              <MiniLineChart
                badgeLabel="Realtime Active"
                points={
                  realtimeLinePoints.length
                    ? realtimeLinePoints
                    : [{ label: "-", value: 0 }]
                }
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-900">
                  Updates per Hour (24h, WIB)
                </div>
                <div className="text-xs font-medium text-slate-600">
                  total update 24 jam:{" "}
                  <span className="font-semibold text-slate-900">
                    {metrics?.updates24h?.total ?? "-"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <MiniLineChart
                badgeLabel="Updates / Hour"
                points={
                  updatesByHour.length
                    ? updatesByHour.map((x) => ({
                        label: x.label,
                        value: x.value,
                      }))
                    : [{ label: "-", value: 0 }]
                }
                minMaxRight={
                  <span className="text-xs font-semibold text-slate-600">
                    24 jam terakhir
                  </span>
                }
              />
            </div>
          </div>
        </div>

        {/* ✅ Plan vs Actual (dengan filter delivery date + filter destinasi group) */}
        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-extrabold text-slate-900">
                  Plan vs Actual
                </div>
                <div className="text-xs font-medium text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {fmtDeliveryDate(deliveryDateFilter)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* ✅ filter group destinasi */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPlanGroupFilter("ALL")}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50 ${
                      planGroupFilter === "ALL"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    All
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlanGroupFilter("YIMM")}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50 ${
                      planGroupFilter === "YIMM"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    YIMM
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlanGroupFilter("SIM")}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50 ${
                      planGroupFilter === "SIM"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    SIM
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setDeliveryDateFilter(yesterdayWIB())}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Kemarin
                </button>

                <button
                  type="button"
                  onClick={() => setDeliveryDateFilter(todayWIB())}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Hari ini
                </button>

                <input
                  type="date"
                  value={deliveryDateFilter}
                  onChange={(e) => setDeliveryDateFilter(e.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
                />
              </div>
            </div>

            <div className="mt-4">
              <PlanVsActualChart rows={planVsActualRows} />
            </div>
          </div>
        </div>

        {/* ON PROGRESS */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                On Progress
              </div>
              <div className="text-xs font-medium text-slate-600">
                {/* menampilkan maksimal 20 baris • trip sedang berjalan */}
              </div>
            </div>

            <div className="text-xs font-semibold text-slate-600">
              Total:{" "}
              <span className="text-slate-900">{activeDriversCount}</span>
            </div>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-extrabold">Driver</th>
                  <th className="text-left py-3 px-4 font-extrabold">Plate</th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Destination
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Delivery Date
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Updated
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {(loading ? [] : activeDrivers).slice(0, 20).map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {d.driver?.name ?? "-"}
                    </td>

                    <td className="py-3 px-4 text-slate-700 font-semibold">
                      {d.plate ?? "-"}
                    </td>

                    <td className="py-3 px-4 text-slate-700">
                      <div className="font-semibold text-slate-900">
                        {d.destination ?? "-"}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        ETD:{" "}
                        <span className="text-slate-700">
                          {d.etdTime ?? "-"}
                        </span>{" "}
                        • ETA:{" "}
                        <span className="text-slate-700">
                          {d.etaTime ?? "-"}
                        </span>
                      </div>
                    </td>

                    {/* ✅ Delivery Date: ambil dari mobile, fallback ke tanggal WIB updatedAt */}
                    <td className="py-3 px-4 text-slate-700 font-semibold">
                      {d.deliveryDate
                        ? fmtDeliveryDate(d.deliveryDate)
                        : fmtDateWIB(d.updatedAt)}
                    </td>

                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {fmtLastUpdate(d.updatedAt)}
                    </td>
                  </tr>
                ))}

                {!loading && activeDrivers.length === 0 && (
                  <tr>
                    <td className="py-5 px-4 text-slate-600" colSpan={5}>
                      Belum ada trip yang berjalan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs font-medium text-slate-500">
            {/* Trip akan otomatis hilang dari On Progress & Map setelah reverse
            selesai (ETD + ETA). */}
          </div>
        </div>

        {/* HISTORY COMPLETE */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                History (Complete)
              </div>
              <div className="text-xs font-medium text-slate-600">
                trip selesai untuk tanggal delivery{" "}
                <span className="font-semibold text-slate-900">
                  {fmtDeliveryDate(deliveryDateFilter)}
                </span>{" "}
                (WIB)
              </div>
            </div>

            <div className="text-xs font-semibold text-slate-600">
              Total:{" "}
              <span className="text-slate-900">{historyRows.length}</span>
            </div>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-extrabold">Driver</th>
                  <th className="text-left py-3 px-4 font-extrabold">Plate</th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Forward
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Reverse
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Delivery Date
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Last Updated
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {historyRows.slice(0, 30).map((r) => (
                  <tr
                    key={`${r.tripGroup}__${r.driverId}`}
                    className="hover:bg-slate-50"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {r.driverName ?? "-"}
                      {r.driverPhone ? (
                        <div className="text-xs font-semibold text-slate-500">
                          {r.driverPhone}
                        </div>
                      ) : null}
                    </td>

                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {r.plate ?? "-"}
                    </td>

                    <td className="py-3 px-4 text-slate-700">
                      <div className="font-semibold text-slate-900">
                        {r.destinationForward ?? "-"}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        ETD:{" "}
                        <span className="text-slate-700">
                          {r.etdForward ?? "-"}
                        </span>{" "}
                        • ETA:{" "}
                        <span className="text-slate-700">
                          {r.etaForward ?? "-"}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-700">
                      <div className="font-semibold text-slate-900">
                        {r.destinationReverse ?? "PT Indonesia Koito"}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        ETD:{" "}
                        <span className="text-slate-700">
                          {r.etdReverse ?? "-"}
                        </span>{" "}
                        • ETA:{" "}
                        <span className="text-slate-700">
                          {r.etaReverse ?? "-"}
                        </span>
                      </div>
                    </td>

                    {/* ✅ Delivery Date: utamakan dari mobile, fallback ke lastUpdated */}
                    <td className="py-3 px-4 text-slate-700 font-semibold">
                      {r.deliveryDate
                        ? fmtDeliveryDate(r.deliveryDate)
                        : fmtDateWIB(r.lastUpdated)}
                    </td>

                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {fmtLastUpdate(r.lastUpdated)}
                    </td>
                  </tr>
                ))}

                {historyRows.length === 0 && (
                  <tr>
                    <td className="py-5 px-4 text-slate-600" colSpan={6}>
                      Belum ada trip selesai untuk tanggal ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs font-medium text-slate-500">
            {/* Note: History diambil dari report dengan filter complete = true dan
            dateFrom = dateTo (tanggal delivery yang dipilih). */}
          </div>
        </div>
      </div>
    </div>
  );
}

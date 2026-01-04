// src/app/(app)/dashboard/page.tsx

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type DriverStatus = {
  id: string;
  driverId: string;

  // lokasi
  lat: number | null;
  lng: number | null;
  heading: number | null;

  // status trip
  direction?: "forward" | "reverse" | null;
  origin?: string | null;
  destination?: string | null;
  plate: string | null;
  etdTime?: string | null;
  etaTime?: string | null;
  isFinished?: boolean | null;

  updatedAt: string;

  // ✅ NEW: dari mobile / server (YYYY-MM-DD)
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

function fmtDeliveryDate(deliveryDate?: string | null) {
  if (!deliveryDate) return "-";
  const s = String(deliveryDate).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
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

  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);

  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ================================
// ✅ PLAN MASTER (fallback kalau DB kosong)
// ================================
const PLAN_BY_DEST: Record<
  string,
  { etd: string; eta: string; group: string }
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

// ✅ sesuai response /api/plan/list
type PlanFromDbRow = {
  destination: string;
  group: string;
  forwardEtd: string | null;
  forwardEta: string | null;
  reverseEtd: string | null;
  reverseEta: string | null;
};

type PlanMap = Record<
  string,
  {
    group: string;
    forward: { etd: string; eta: string };
    reverse: { etd: string; eta: string };
  }
>;

// ================================
// ✅ FIX: normalize & parse time
// ================================
function normalizeTimeHHmm(input?: string | null) {
  if (!input) return "-";
  const s = String(input).trim();
  if (!s || s === "-" || s.toLowerCase() === "null") return "-";

  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return s;
  const hh = String(Number(m[1])).padStart(2, "0");
  const mm = String(Number(m[2])).padStart(2, "0");
  return `${hh}:${mm}`;
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

function diffMin(etd?: string | null, eta?: string | null) {
  const a = parseTimeToMin(etd);
  const b = parseTimeToMin(eta);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d < 0) d += 24 * 60;
  return d;
}

// ✅ delay minutes: only if actual > plan
function delayMin(plan?: string | null, actual?: string | null) {
  const p = parseTimeToMin(plan);
  const a = parseTimeToMin(actual);
  if (p == null || a == null) return null;
  const d = a - p;
  return d > 0 ? d : 0;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
      {children}
    </span>
  );
}

function Pill({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "blue" | "rose";
}) {
  const cls =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-extrabold ${cls}`}
    >
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
        </div>

        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

// ================================
// ✅ Chart A: On-time vs Delay
// ================================
function OnTimeVsDelayChart({
  badgeLabel,
  onTime,
  delayed,
  noData,
}: {
  badgeLabel: string;
  onTime: number;
  delayed: number;
  noData: number;
}) {
  const total = Math.max(1, onTime + delayed + noData);
  // Donut chart: each segment is a portion of 360deg
  const getSegment = (value: number) => (value / total) * 100;
  const segments = [
    { label: "On-time", value: onTime, color: "#16A34A" },
    { label: "Delay", value: delayed, color: "#DC2626" },
    { label: "No data", value: noData, color: "#94A3B8" },
  ];
  // For SVG arc, use stroke-dasharray and stroke-dashoffset
  let acc = 0;
  const donutSegments = segments.map((seg) => {
    const percent = getSegment(seg.value);
    const from = acc;
    acc += percent;
    return { ...seg, percent, from };
  });
  // Donut size
  const size = 120;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <Badge>{badgeLabel}</Badge>
        <div className="text-xs font-semibold text-slate-600">
          By trip (count)
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 flex flex-col items-center">
        {/* Donut SVG */}
        <div
          className="relative flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          <svg width={size} height={size} className="block">
            {donutSegments.map((seg, idx) => {
              // stroke-dasharray: portion, rest
              const dash = (seg.percent / 100) * circumference;
              const rest = circumference - dash;
              // stroke-dashoffset: sum of previous
              const offset = (seg.from / 100) * circumference;
              return (
                <circle
                  key={seg.label}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${rest}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "50% 50%",
                    transition: "stroke-dasharray 0.5s",
                  }}
                />
              );
            })}
            {/* Background circle for empty */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#E5E7EB"
              strokeWidth={stroke}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                zIndex: 0,
              }}
            />
          </svg>
          {/* Center text */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ pointerEvents: "none" }}
          >
            <span className="text-[11px] font-semibold text-slate-500">
              Total Trip
            </span>
            <span className="text-2xl font-extrabold text-slate-900">
              {onTime + delayed + noData}
            </span>
          </div>
        </div>
        {/* Legend */}
        <div className="mt-5 flex flex-col gap-2 w-full max-w-xs">
          {segments.map((seg) => (
            <div
              key={seg.label}
              className="flex items-center justify-between text-xs font-semibold"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: seg.color }}
                />
                <span className="font-extrabold text-slate-800">
                  {seg.label}
                </span>
              </div>
              <div className="font-extrabold text-slate-900">{seg.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ================================
// ✅ Chart C: Top Delay Destinations
// ================================
function TopDelayDestinationsChart({
  badgeLabel,
  rows,
}: {
  badgeLabel: string;
  rows: { label: string; avgDelayMin: number; sample: number }[];
}) {
  const maxV = Math.max(1, ...rows.map((r) => r.avgDelayMin));
  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <Badge>{badgeLabel}</Badge>
        <div className="text-xs font-semibold text-slate-600">
          Avg delay (min)
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {rows.length === 0 ? (
          <div className="text-sm font-medium text-slate-500">
            Belum ada data delay.
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => {
              const w = clamp((r.avgDelayMin / maxV) * 100, 6, 100);
              return (
                <div key={r.label} className="flex items-center gap-2">
                  <div className="truncate flex-1 text-sm font-extrabold text-slate-900 max-w-[120px]">
                    {r.label}
                  </div>
                  <div className="flex-1">
                    <div className="h-3.5 rounded bg-rose-100 relative">
                      <div
                        className="h-3.5 rounded bg-rose-600"
                        style={{ width: `${w}%` }}
                      ></div>
                    </div>
                  </div>
                  <span className="ml-2 shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-extrabold text-rose-700">
                    {Math.round(r.avgDelayMin)}m
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2 text-[11px] font-semibold text-slate-500"></div>
      </div>
    </div>
  );
}

/**
 * ✅ Overall Delivery Compare (Count):
 * - Plan = LINE (target delivery count / destinasi)
 * - Actual = BAR (jumlah delivery COMPLETE)
 *   (bar hanya muncul kalau completeCount > 0)
 */
function PlanLineActualBarChart({
  rows,
  badgeLabel,
}: {
  badgeLabel: string;
  rows: { label: string; planCount: number; completeCount: number }[];
}) {
  // ✅ dibuat lebih tinggi supaya label destinasi kebaca
  const width = Math.max(980, rows.length * 120);
  const height = 340;

  const padX = 34;
  const padTop = 20;
  const padBottom = 170;

  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  // Axis = count
  const maxPlan = Math.max(1, ...rows.map((r) => r.planCount));
  const maxCnt = Math.max(1, ...rows.map((r) => r.completeCount));
  const maxY = Math.max(1, maxPlan, maxCnt);

  const toX = (i: number) =>
    padX + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * innerW);

  const toY = (v: number) => padTop + (1 - v / (maxY || 1)) * innerH;

  const lineD = rows
    .map((r, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(r.planCount)}`)
    .join(" ");

  const barW =
    rows.length <= 1
      ? 80
      : Math.max(14, Math.min(90, innerW / rows.length - 16));

  const leftLabel = rows[0]?.label ?? "-";
  const rightLabel = rows[rows.length - 1]?.label ?? "-";

  // ✅ split label jadi max 2 baris biar kebaca
  const wrap2 = (label: string) => {
    const s = String(label ?? "").trim();
    if (!s) return ["-"];

    // kalau pendek, langsung
    if (s.length <= 14) return [s];

    // coba pecah di spasi terdekat tengah
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      return [
        s.slice(0, 16) + "…",
        s.slice(16, 32) + (s.length > 32 ? "…" : ""),
      ];
    }

    // gabung sampai kira-kira setengah
    const target = Math.ceil(s.length / 2);
    let a: string[] = [];
    let len = 0;
    for (const p of parts) {
      const nextLen = len + (a.length ? 1 : 0) + p.length;
      if (nextLen > target && a.length) break;
      a.push(p);
      len = nextLen;
    }
    const b = parts.slice(a.length);
    const l1 = a.join(" ");
    const l2 = b.join(" ");

    // safety truncate
    const t1 = l1.length > 16 ? l1.slice(0, 16) + "…" : l1;
    const t2 = l2.length > 16 ? l2.slice(0, 16) + "…" : l2;

    return t2 ? [t1, t2] : [t1];
  };

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <Badge>{badgeLabel}</Badge>
        <div className="text-xs font-semibold text-slate-600">
          {/* Plan = target (garis) • Actual = delivery complete (batang) */}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3">
        {rows.length === 0 ? (
          <div className="p-3 text-sm font-medium text-slate-500">
            Belum ada data.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="h-[340px]"
                style={{ minWidth: width }}
              >
                {/* grid */}
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

                {/* bars (actual complete) */}
                <g>
                  {rows.map((r, i) => {
                    if (!r.completeCount) return null;
                    const x = toX(i) - barW / 2;
                    const y = toY(r.completeCount);
                    const h = padTop + innerH - y;
                    return (
                      <g key={i}>
                        <rect
                          x={x}
                          y={y}
                          width={barW}
                          height={Math.max(0, h)}
                          rx={10}
                          fill="#16A34A"
                          opacity={0.85}
                        />
                        {/* value label on top of bar */}
                        <text
                          x={toX(i)}
                          y={Math.max(padTop + 12, y - 8)}
                          textAnchor="middle"
                          fontSize="12"
                          fontWeight="800"
                          fill="#64748B"
                        >
                          {r.completeCount}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* plan line (target count) */}
                <path
                  d={lineD}
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                />
                {rows.map((r, i) => (
                  <circle
                    key={i}
                    cx={toX(i)}
                    cy={toY(r.planCount)}
                    r={4.2}
                    fill="#2563EB"
                    opacity={0.95}
                  />
                ))}

                {/* axis labels */}
                <g fontSize="12" fill="#64748B" fontWeight="800">
                  <text x={padX} y={padTop + 12} textAnchor="start">
                    {maxY}
                  </text>
                  <text x={padX} y={padTop + innerH + 14} textAnchor="start">
                    0
                  </text>
                </g>

                {/* x labels (destination) - ✅ multiline, tidak diputar supaya tidak kepotong */}
                <g fontSize="10" fill="#475569" fontWeight="700">
                  {rows.map((r, i) => {
                    const lines = wrap2(r.label);
                    const x = toX(i);
                    const y = padTop + innerH + 48;
                    return (
                      <text key={i} x={x} y={y} textAnchor="middle">
                        {lines.map((ln, idx) => (
                          <tspan key={idx} x={x} dy={idx === 0 ? 0 : 14}>
                            {ln}
                          </tspan>
                        ))}
                      </text>
                    );
                  })}
                </g>
              </svg>
            </div>

            {/* <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-600">
              <span className="truncate">{leftLabel}</span>
              <span className="truncate">{rightLabel}</span>
            </div> */}

            {/* legend */}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2.5 w-7 rounded-full bg-blue-600" />
                Plan (target delivery)
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2.5 w-7 rounded-full bg-emerald-600" />
                Actual (delivery complete)
              </span>
            </div>

            {/* helper text */}
            {/* <div className="mt-1 text-[11px] font-semibold text-slate-500">
              Garis = destinasi yang punya plan (target 1). Batang muncul otomatis kalau ada delivery yang{" "}
              <span className="font-extrabold">complete</span>.
            </div> */}
          </>
        )}
      </div>
    </div>
  );
}

function PlanVsActualChart({
  mode,
  rows,
  getGroup,
}: {
  mode: "forward" | "reverse";
  rows: {
    destination: string;
    planEtd: string;
    planEta: string;
    planDurMin: number;
    actualAvgMin: number | null;
    actualSample: number;

    // delay (boolean saja untuk display)
    delayedAny: boolean;
  }[];
  getGroup: (dest: string) => string;
}) {
  const maxV = Math.max(
    1,
    ...rows.map((r) => Math.max(r.planDurMin, r.actualAvgMin ?? 0))
  );

  const modeLabel = mode === "forward" ? "Keberangkatan" : "Kepulangan";

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <Badge>Plan vs Actual • {modeLabel}</Badge>
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
                <div key={`${mode}__${r.destination}`} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-slate-900">
                        {r.destination}
                      </div>

                      <div className="mt-0.5 text-xs font-semibold text-slate-500">
                        Plan:{" "}
                        <span className="text-slate-800">
                          {r.planEtd} → {r.planEta}
                        </span>{" "}
                        ({r.planDurMin}m)
                      </div>

                      {/* ✅ Delay cuma badge "DELAY" */}
                      {r.delayedAny ? (
                        <div className="mt-2">
                          <Pill tone="rose">DELAY</Pill>
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0">
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[13px] font-extrabold text-blue-700">
                        {getGroup(r.destination)}
                      </span>
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
      </div>
    </div>
  );
}

// helper From -> To untuk On Progress
function getFromTo(d: DriverStatus) {
  const dir = (d.direction ?? "").toLowerCase();
  const originRaw = (d.origin ?? "").trim();
  const destRaw = (d.destination ?? "").trim();

  const KOITO = "PT Indonesia Koito";

  if (originRaw && destRaw) return { from: originRaw, to: destRaw };

  if (dir === "reverse") {
    const from = originRaw || destRaw || "-";
    return { from, to: KOITO };
  }

  const to = destRaw || "-";
  return { from: KOITO, to };
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [deliveryDateFilter, setDeliveryDateFilter] = useState<string>(
    todayWIB()
  );

  const [planGroupFilter, setPlanGroupFilter] = useState<string>("ALL");

  // ✅ toggle chart forward/reverse
  const [planLegMode, setPlanLegMode] = useState<"forward" | "reverse">(
    "forward"
  );

  const [planFromDb, setPlanFromDb] = useState<PlanMap | null>(null);

  const [latest, setLatest] = useState<DriverStatus[]>([]);

  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
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
    } catch {}
  };

  const fetchMetrics = async () => {
    try {
      const res = await fetch("/api/dashboard/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DashboardMetrics = await res.json();
      if (json?.ok) setMetrics(json);
    } catch {}
  };

  const fetchPlan = async (dayArg?: string) => {
    try {
      const day = dayArg ?? deliveryDateFilter ?? todayWIB();
      const res = await fetch(`/api/plan/list?deliveryDate=${day}`, {
        cache: "no-store",
      });
      if (!res.ok) return;

      const json = await res.json();
      const plans: PlanFromDbRow[] = Array.isArray(json?.plans)
        ? json.plans
        : [];

      if (!plans.length) {
        setPlanFromDb(null);
        return;
      }

      const map: PlanMap = {};

      for (const p of plans) {
        if (!p?.destination) continue;

        const fEtd = normalizeTimeHHmm(p.forwardEtd);
        const fEta = normalizeTimeHHmm(p.forwardEta);
        const rEtd = normalizeTimeHHmm(p.reverseEtd);
        const rEta = normalizeTimeHHmm(p.reverseEta);

        map[p.destination] = {
          group: String(p.group ?? "").trim(),
          forward: { etd: fEtd, eta: fEta },
          reverse: { etd: rEtd, eta: rEta },
        };
      }

      setPlanFromDb(map);
    } catch {}
  };

  useEffect(() => {
    fetchLatest();
    fetchHistory(deliveryDateFilter);
    fetchMetrics();
    fetchPlan(deliveryDateFilter);

    const id1 = window.setInterval(fetchLatest, 5000);
    const idH = window.setInterval(
      () => fetchHistory(deliveryDateFilter),
      30000
    );
    const id2 = window.setInterval(fetchMetrics, 30000);
    const idP = window.setInterval(() => fetchPlan(deliveryDateFilter), 120000);

    return () => {
      window.clearInterval(id1);
      window.clearInterval(idH);
      window.clearInterval(id2);
      window.clearInterval(idP);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchHistory(deliveryDateFilter);
    fetchPlan(deliveryDateFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryDateFilter]);

  // ✅ hanya yang masih progress (belum complete) + ada posisi
  const activeDrivers = useMemo(() => {
    return latest.filter((d) => {
      if (d.lat == null || d.lng == null) return false;
      if (d.isFinished === true) return false; // ✅ COMPLETE => hide
      return true;
    });
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

  // ✅ pilih plan yang dipakai: DB > fallback
  const effectivePlan: PlanMap = useMemo(() => {
    if (planFromDb) return planFromDb;

    // fallback: reverse disamakan dengan forward (karena plan master lama hanya 1 set)
    const map: PlanMap = {};
    for (const dest of Object.keys(PLAN_BY_DEST)) {
      map[dest] = {
        group: PLAN_BY_DEST[dest].group,
        forward: { etd: PLAN_BY_DEST[dest].etd, eta: PLAN_BY_DEST[dest].eta },
        reverse: { etd: PLAN_BY_DEST[dest].etd, eta: PLAN_BY_DEST[dest].eta },
      };
    }
    return map;
  }, [planFromDb]);

  const availableGroups = useMemo(() => {
    const s = new Set<string>();
    for (const dest of Object.keys(effectivePlan)) {
      const g = (effectivePlan[dest]?.group ?? "").trim();
      if (g) s.add(g);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [effectivePlan]);

  const getGroupByDest = (dest: string) =>
    (effectivePlan[dest]?.group ?? "").trim() || "OTHER";

  // ✅ rows untuk Plan vs Actual per LEG (forward/reverse)
  const planVsActualRows = useMemo(() => {
    const dests = Object.keys(effectivePlan).filter((dest) => {
      const g = (effectivePlan[dest]?.group ?? "").trim();
      if (planGroupFilter === "ALL") return true;
      return g === planGroupFilter;
    });

    const buckets = new Map<string, number[]>();
    const delayedDest = new Set<string>();

    for (const r of historyRows) {
      const dest =
        planLegMode === "forward"
          ? (r.destinationForward ?? "").trim()
          : (r.destinationReverse ?? "").trim();

      if (!dest || !effectivePlan[dest]) continue;

      const g = (effectivePlan[dest]?.group ?? "").trim();
      if (planGroupFilter !== "ALL" && g !== planGroupFilter) continue;

      // duration actual sesuai leg
      const etdA = planLegMode === "forward" ? r.etdForward : r.etdReverse;
      const etaA = planLegMode === "forward" ? r.etaForward : r.etaReverse;

      const dur = diffMin(etdA, etaA);
      if (dur != null) {
        const arr = buckets.get(dest) ?? [];
        arr.push(dur);
        buckets.set(dest, arr);
      }

      // delay check vs plan sesuai leg (ETD atau ETA lewat plan)
      const plan = effectivePlan[dest]?.[planLegMode];
      const de = delayMin(plan?.etd, etdA);
      const da = delayMin(plan?.eta, etaA);
      if ((de != null && de > 0) || (da != null && da > 0)) {
        delayedDest.add(dest);
      }
    }

    return dests
      .map((dest) => {
        const plan = effectivePlan[dest]?.[planLegMode];
        const planEtd = normalizeTimeHHmm(plan?.etd ?? "-");
        const planEta = normalizeTimeHHmm(plan?.eta ?? "-");
        const planDur = diffMin(planEtd, planEta) ?? 0;

        const arr = buckets.get(dest) ?? [];
        const avg =
          arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

        return {
          destination: dest,
          planEtd,
          planEta,
          planDurMin: planDur,
          actualAvgMin: avg,
          actualSample: arr.length,
          delayedAny: delayedDest.has(dest),
        };
      })
      .sort((a, b) => a.destination.localeCompare(b.destination));
  }, [historyRows, planGroupFilter, effectivePlan, planLegMode]);

  // ✅ Overall delivery complete: bandingkan target plan (1/destinasi) vs aktual (jumlah delivery complete)
  const overallCompleteRows = useMemo(() => {
    const dests = Object.keys(effectivePlan).filter((dest) => {
      const g = (effectivePlan[dest]?.group ?? "").trim();
      if (planGroupFilter === "ALL") return true;
      return g === planGroupFilter;
    });

    // complete count per destination (ambil dari history complete)
    const cntMap = new Map<string, number>();

    for (const r of historyRows) {
      if (!r.isComplete) continue;

      // destination untuk grouping cukup pakai forward (master destinasi)
      const dest = (r.destinationForward ?? "").trim();
      if (!dest || !effectivePlan[dest]) continue;

      const g = (effectivePlan[dest]?.group ?? "").trim();
      if (planGroupFilter !== "ALL" && g !== planGroupFilter) continue;

      cntMap.set(dest, (cntMap.get(dest) ?? 0) + 1);
    }

    return dests
      .map((dest) => ({
        label: dest,
        // plan selalu ada untuk destinasi ini => target 1
        planCount: 1,
        // actual mengikuti update driver (complete)
        completeCount: cntMap.get(dest) ?? 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [historyRows, effectivePlan, planGroupFilter]);

  // ✅ History filter: Group (based on destinationForward's plan group)
  const filteredHistoryRows = useMemo(() => {
    if (planGroupFilter === "ALL") return historyRows;

    return historyRows.filter((r) => {
      const dest = (r.destinationForward ?? "").trim();
      if (!dest) return false;
      const g = (effectivePlan[dest]?.group ?? "").trim();
      return g === planGroupFilter;
    });
  }, [historyRows, effectivePlan, planGroupFilter]);

  // ✅ A: On-time vs Delay summary (ikuti Mode + Group + Date)
  const onTimeDelaySummary = useMemo(() => {
    let onTime = 0;
    let delayed = 0;
    let noData = 0;

    for (const r of historyRows) {
      // destination sesuai leg
      const dest =
        planLegMode === "forward"
          ? (r.destinationForward ?? "").trim()
          : (r.destinationReverse ?? "").trim();

      if (!dest || !effectivePlan[dest]) continue;

      const g = (effectivePlan[dest]?.group ?? "").trim();
      if (planGroupFilter !== "ALL" && g !== planGroupFilter) continue;

      const plan = effectivePlan[dest]?.[planLegMode];
      const planEtd = plan?.etd ?? null;
      const planEta = plan?.eta ?? null;

      const etdA = planLegMode === "forward" ? r.etdForward : r.etdReverse;
      const etaA = planLegMode === "forward" ? r.etaForward : r.etaReverse;

      const de = delayMin(planEtd, etdA);
      const da = delayMin(planEta, etaA);

      // No data kalau plan atau actual tidak bisa dihitung
      const hasAny = de != null || da != null;
      if (!hasAny) {
        noData += 1;
        continue;
      }

      const isDelayed = (de != null && de > 0) || (da != null && da > 0);
      if (isDelayed) delayed += 1;
      else onTime += 1;
    }

    return { onTime, delayed, noData };
  }, [historyRows, effectivePlan, planGroupFilter, planLegMode]);

  // ✅ C: Top delay destinations (avg delay minutes) - Top 5
  const topDelayDestinations = useMemo(() => {
    const map = new Map<string, number[]>();

    for (const r of historyRows) {
      const dest =
        planLegMode === "forward"
          ? (r.destinationForward ?? "").trim()
          : (r.destinationReverse ?? "").trim();

      if (!dest || !effectivePlan[dest]) continue;

      const g = (effectivePlan[dest]?.group ?? "").trim();
      if (planGroupFilter !== "ALL" && g !== planGroupFilter) continue;

      const plan = effectivePlan[dest]?.[planLegMode];
      const etdA = planLegMode === "forward" ? r.etdForward : r.etdReverse;
      const etaA = planLegMode === "forward" ? r.etaForward : r.etaReverse;

      const de = delayMin(plan?.etd ?? null, etdA);
      const da = delayMin(plan?.eta ?? null, etaA);

      // ambil delay terbesar per trip (lebih representatif)
      const d1 = de ?? null;
      const d2 = da ?? null;
      const best = d1 == null && d2 == null ? null : Math.max(d1 ?? 0, d2 ?? 0);

      if (best == null) continue;
      if (best <= 0) continue; // hanya yang delay

      const arr = map.get(dest) ?? [];
      arr.push(best);
      map.set(dest, arr);
    }

    return Array.from(map.entries())
      .map(([label, arr]) => ({
        label,
        avgDelayMin: arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length),
        sample: arr.length,
      }))
      .sort((a, b) => b.avgDelayMin - a.avgDelayMin)
      .slice(0, 5);
  }, [historyRows, effectivePlan, planGroupFilter, planLegMode]);

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-slate-50">
      <div className="w-full px-3 md:px-4 lg:px-6 xl:px-8 py-6 space-y-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-extrabold tracking-tight text-slate-900">
              Dashboard Operasional
            </div>
            <div className="text-sm font-medium text-slate-600"></div>
          </div>
          <div className="flex items-center gap-2"></div>
        </div>

        {err ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {err}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>

        {/* ✅ Global Filter (dipakai untuk semua section) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Group */}
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
              <div className="mr-1 text-[11px] font-extrabold text-slate-600">
                Group
              </div>
              <div className="flex flex-wrap items-center gap-2">
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

                {availableGroups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setPlanGroupFilter(g)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50 ${
                      planGroupFilter === g
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
              <div className="mr-1 text-[11px] font-extrabold text-slate-600">
                Date
              </div>
              <button
                type="button"
                onClick={() => setDeliveryDateFilter(yesterdayWIB())}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  deliveryDateFilter === yesterdayWIB()
                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Kemarin
              </button>

              <button
                type="button"
                onClick={() => setDeliveryDateFilter(todayWIB())}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  deliveryDateFilter === todayWIB()
                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
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

            {/* Mode */}
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
              <div className="mr-1 text-[11px] font-extrabold text-slate-600">
                Mode
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlanLegMode("forward")}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50 ${
                    planLegMode === "forward"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  Forward
                </button>
                <button
                  type="button"
                  onClick={() => setPlanLegMode("reverse")}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50 ${
                    planLegMode === "reverse"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  Reverse
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ A & C: Pengganti 2 grafik lama (posisi side-by-side) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <OnTimeVsDelayChart
              badgeLabel={`On-time vs Delay`}
              onTime={onTimeDelaySummary.onTime}
              delayed={onTimeDelaySummary.delayed}
              noData={onTimeDelaySummary.noData}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <TopDelayDestinationsChart
              badgeLabel={`Top Delay Destinations`}
              rows={topDelayDestinations}
            />
          </div>
        </div>

        {/* ✅ Grafik baru: Overall Delivery Complete (Plan line, Actual bar) */}
        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-extrabold text-slate-900">
                  Overall Delivery (Complete)
                </div>
                <div className="text-xs font-medium text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {fmtDeliveryDate(deliveryDateFilter)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <PlanLineActualBarChart
                badgeLabel="Plan vs Actual (Complete)"
                rows={overallCompleteRows}
              />
            </div>
          </div>
        </div>

        {/* ✅ Plan vs Actual + Toggle Forward/Reverse */}
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
            </div>

            <div className="mt-4">
              <PlanVsActualChart
                mode={planLegMode}
                rows={planVsActualRows}
                getGroup={getGroupByDest}
              />
            </div>
          </div>
        </div>

        {/* ✅ ON PROGRESS */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                On Progress
              </div>
              <div className="text-xs font-medium text-slate-600"></div>
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
                  <th className="text-left py-3 px-4 font-extrabold">
                    Police Number
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">Route</th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Delivery Date
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Updated
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {(loading ? [] : activeDrivers).slice(0, 20).map((d) => {
                  const { from, to } = getFromTo(d);
                  const dir = (d.direction ?? "forward").toUpperCase();

                  return (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {d.driver?.name ?? "-"}
                        {d.driver?.phone ? (
                          <div className="text-xs font-semibold text-slate-500">
                            {d.driver.phone}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 px-4 text-slate-700 font-semibold">
                        {d.plate ?? "-"}
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-semibold text-slate-900">
                          <span className="mr-2 inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-extrabold text-slate-700">
                            {dir}
                          </span>
                          {from} → {to}
                        </div>

                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          ETD:{" "}
                          <span className="text-slate-700">
                            {normalizeTimeHHmm(d.etdTime)}
                          </span>{" "}
                          • ETA:{" "}
                          <span className="text-slate-700">
                            {normalizeTimeHHmm(d.etaTime)}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-700 font-semibold">
                        {d.deliveryDate
                          ? fmtDeliveryDate(d.deliveryDate)
                          : fmtDateWIB(d.updatedAt)}
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {fmtLastUpdate(d.updatedAt)}
                      </td>
                    </tr>
                  );
                })}

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
        </div>

        {/* HISTORY COMPLETE */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                History (Complete)
              </div>
              <div className="text-xs font-medium text-slate-600">
                {/* trip selesai untuk tanggal delivery{" "} */}
                <span className="font-semibold text-slate-900">
                  {fmtDeliveryDate(deliveryDateFilter)}
                </span>{" "}
                {/* (WIB) */}
              </div>
            </div>

            <div className="text-xs font-semibold text-slate-600">
              Total:{" "}
              <span className="text-slate-900">
                {filteredHistoryRows.length}
              </span>
            </div>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-extrabold">Driver</th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Police Number
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Forward (Keberangkatan)
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Reverse (Kepulangan)
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
                {filteredHistoryRows.slice(0, 30).map((r) => (
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
                          {normalizeTimeHHmm(r.etdForward)}
                        </span>{" "}
                        • ETA:{" "}
                        <span className="text-slate-700">
                          {normalizeTimeHHmm(r.etaForward)}
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
                          {normalizeTimeHHmm(r.etdReverse)}
                        </span>{" "}
                        • ETA:{" "}
                        <span className="text-slate-700">
                          {normalizeTimeHHmm(r.etaReverse)}
                        </span>
                      </div>
                    </td>

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

                {filteredHistoryRows.length === 0 && (
                  <tr>
                    <td className="py-5 px-4 text-slate-600" colSpan={6}>
                      Belum ada trip selesai untuk tanggal ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

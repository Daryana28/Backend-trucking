// src/app/(app)/dashboard/page.tsx

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  speed?: number | null;

  updatedAt: string;

  // ✅ NEW: dari mobile / server (YYYY-MM-DD)
  deliveryDate?: string | null;

  driver: { name: string; phone?: string | null };
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

function fmtTimeHHmm(d: Date) {
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtKm(m?: number | null) {
  const n = typeof m === "number" && Number.isFinite(m) ? m : 0;
  return `${(n / 1000).toFixed(1)} km`;
}

function fmtHm(sec?: number | null) {
  const n =
    typeof sec === "number" && Number.isFinite(sec)
      ? Math.max(0, Math.floor(sec))
      : 0;
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h <= 0) return `${m} min`;
  return `${h}h ${m}min`;
}

function normEpochSecMaybe(v: number) {
  return v > 10_000_000_000 ? Math.floor(v / 1000) : Math.floor(v);
}

function getStopStartSec(s: any): number | null {
  const v = s?.startSec ?? s?.startTime ?? s?.start_time ?? null;
  if (typeof v !== "number") return null;
  return normEpochSecMaybe(v);
}

function getStopEndSec(s: any): number | null {
  const v = s?.endSec ?? s?.endTime ?? s?.start_driving_time ?? null;
  if (typeof v !== "number") return null;
  return normEpochSecMaybe(v);
}

type TimelineCacheEntry = {
  items: any[];
  savedAt: number;
  hasRelevant: boolean;
  hasDrive: boolean;
};

function analyzeTimelineItems(items: any[]) {
  const onlyDriveZero =
    items.length === 1 &&
    items[0]?.type === "DRIVE" &&
    Number(items[0]?.distanceMeters ?? 0) === 0;
  const hasRelevant = items.length > 0 && !onlyDriveZero;
  const hasDrive = items.some(
    (x: any) => x?.type === "DRIVE" && Number(x?.durationSec ?? 0) > 0,
  );
  return { hasRelevant, hasDrive, onlyDriveZero };
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type LatLng = { lat: number; lng: number };
type CustomerTargetPoint = { lat: number; lng: number; radiusM?: number };

const ARRIVAL_RADIUS_M = 2000;
const ARRIVAL_COOLDOWN_MIN = 180;
const GEO_ADDR_CACHE_TTL_MS = 10 * 60 * 1000;
const STOP_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// ✅ titik lokasi tujuan berdasarkan nama customer
// TODO: isi lat/lng sesuai titik tujuan yang valid.
const CUSTOMER_DEST_POINTS: Record<string, CustomerTargetPoint | null> = {
  // Pulogadung Lokal & Export: Jl. Dr. KRT Radjiman Widyodiningrat No.23
  // ✅ Pulogadung (Yamaha Lokal/Export)
  "Yamaha Pulogadung Lokal": {
    lat: -6.192072311258555,
    lng: 106.92462603917761,
    radiusM: 2000,
  },
  "Yamaha Pg export": {
    lat: -6.192072311258555,
    lng: 106.92462603917761,
    radiusM: 2000,
  },
  // ✅ Yamaha West Java (KIIC)
  "Yamaha Karawang": {
    lat: -6.353639318345203,
    lng: 107.28131289197621,
    radiusM: 2000,
  },
};

// ✅ fallback by address keywords (plate-based)
const TARGET_ADDRESS_KEYWORDS_BY_PLATE: Record<string, string[]> = {
  "T 8854": [
    "radjiman",
    "widyodiningrat",
    "rw terate",
    "cakung",
    "jakarta timur",
    "rawa terate",
    "raya bekasi",
    "bekasi",
  ],
  "T 9472": [
    "radjiman",
    "widyodiningrat",
    "rw terate",
    "cakung",
    "jakarta timur",
    "rawa terate",
    "raya bekasi",
    "bekasi",
  ],
  "T 9473": [
    "permata",
    "permata i",
    "puseurjaya",
    "telukjambe",
    "karawang",
    "kiic",
    "bb 1",
    "j7wm",
  ],
  "T 9508": [
    "permata",
    "permata i",
    "puseurjaya",
    "telukjambe",
    "karawang",
    "kiic",
    "bb 1",
    "j7wm",
  ],
  "T 9521": [
    "swadaya",
    "rawa terate",
    "rw terate",
    "cakung",
    "jakarta timur",
    "raya bekasi",
    "bekasi",
  ],
};

const TARGET_ADDRESS_KEYWORDS_BY_CUSTOMER: Record<string, string[]> = {
  "Yamaha Pulogadung Lokal": [
    "radjiman",
    "widyodiningrat",
    "rw terate",
    "cakung",
    "jakarta timur",
    "rawa terate",
    "raya bekasi",
    "bekasi",
  ],
  "Yamaha Pg export": [
    "radjiman",
    "widyodiningrat",
    "rw terate",
    "cakung",
    "jakarta timur",
    "rawa terate",
    "raya bekasi",
    "bekasi",
  ],
  "Yamaha Karawang": [
    "permata",
    "permata i",
    "puseurjaya",
    "telukjambe",
    "karawang",
    "kiic",
    "bb 1",
    "j7wm",
  ],
};

const MIN_KEYWORD_HITS_BY_PLATE: Record<string, number> = {
  "T 8854": 1,
  "T 9472": 1,
  "T 9473": 1,
  "T 9508": 1,
  "T 9521": 1,
};

const MIN_KEYWORD_HITS_BY_CUSTOMER: Record<string, number> = {
  "Yamaha Pulogadung Lokal": 1,
  "Yamaha Pg export": 1,
  "Yamaha Karawang": 1,
};

function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizeAddress(s?: string | null) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressObjectToString(addr: any) {
  if (!addr || typeof addr !== "object") return "";
  const parts = [
    addr.road,
    addr.neighbourhood,
    addr.suburb,
    addr.village,
    addr.town,
    addr.city,
    addr.county,
    addr.state,
    addr.postcode,
    addr.country,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function takeTopStops(stops: any[], n: number) {
  if (!Array.isArray(stops) || !stops.length) return [];
  const ranked = [...stops]
    .map((s) => ({
      lat: typeof s?.lat === "number" ? s.lat : null,
      lng: typeof s?.lng === "number" ? s.lng : null,
      durationSec: Number(s?.durationSec ?? 0) || 0,
    }))
    .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
    .sort((a, b) => b.durationSec - a.durationSec);
  return ranked.slice(0, n).map((s) => ({ lat: s.lat, lng: s.lng }));
}

const ADDRESS_STOPWORDS = new Set([
  "jl",
  "jalan",
  "dr",
  "krt",
  "rt",
  "rw",
  "no",
  "kec",
  "kecamatan",
  "kab",
  "kabupaten",
  "kota",
  "daerah",
  "khusus",
  "ibukota",
  "indonesia",
  "jawa",
  "barat",
]);

function addressTokens(s?: string | null) {
  const norm = normalizeAddress(s);
  if (!norm) return [];
  return norm
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !ADDRESS_STOPWORDS.has(t))
    .filter((t) => t.length >= 4);
}

function isAddressMatchByKeywords(
  addrRaw: string,
  keywords: string[],
  minHits: number,
) {
  const addrNorm = normalizeAddress(addrRaw);
  if (!addrNorm || !keywords.length) return false;
  // match if at least 2 keywords appear (or 1 if only 1 keyword)
  const hits = keywords.filter((k) =>
    addrNorm.includes(normalizeAddress(k)),
  ).length;
  const need = Math.max(1, Math.min(minHits || 1, keywords.length));
  return hits >= need;
}

function plateKeyForAddress(plate?: string | null) {
  const p = normalizePlate(plate);
  if (!p) return "";
  const parts = p.split(" ").filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return p;
}

function isArrivedByPosition(
  current: { lat: number | null; lng: number | null },
  target: CustomerTargetPoint | null | undefined,
) {
  if (!target || current.lat == null || current.lng == null) return false;
  const dist = haversineMeters(
    { lat: current.lat, lng: current.lng },
    { lat: target.lat, lng: target.lng },
  );
  const radius = Number.isFinite(target.radiusM)
    ? Math.max(10, Number(target.radiusM))
    : ARRIVAL_RADIUS_M;
  return dist <= radius;
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

function ymdFromIsoWib(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${dd}`;
}

// ================================
// ✅ CUSTOMER MASTER (label by plate)
// ================================
const CUSTOMER_BY_PLATE: Record<string, string> = {
  "T 9521 AB": "Yamaha Pulogadung Lokal",
  "T 9473 AB": "Yamaha Karawang",
  "T 8854 DH": "Yamaha Pg export",
  "T 9508 AB": "Yamaha Karawang",
  "T 9472 AB": "Yamaha Pulogadung Lokal",
};

function normalizePlate(input?: string | null) {
  if (!input) return "-";
  // Hilangkan suffix setelah tanda '-' (contoh: "T 9521 AB - XYZ" => "T 9521 AB")
  const raw = String(input).trim();
  const beforeDash = raw.split("-")[0]?.trim() ?? raw;
  // rapikan spasi dan uppercase
  return beforeDash.replace(/\s+/g, " ").toUpperCase();
}

function extractPlateFromDestination(dest?: string | null) {
  const s = String(dest ?? "").trim();
  if (!s) return "-";
  const base = s.includes("(") ? s.split("(")[0]!.trim() : s;
  return normalizePlate(base);
}

function getCustomerLabelByPlate(plate?: string | null) {
  const p = normalizePlate(plate);
  if (!p || p === "-") return "";
  return CUSTOMER_BY_PLATE[p] ?? "";
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
  tripCount?: number | null;
  forwardEtd: string | null;
  forwardEta: string | null;
  reverseEtd: string | null;
  reverseEta: string | null;
};

type PlanMap = Record<
  string,
  {
    group: string;
    tripCount: number;
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
  onSelect,
}: {
  badgeLabel: string;
  rows: {
    label: string;
    planCount: number;
    completeCount: number;
    sn?: string;
  }[];
  onSelect?: (sn: string, label: string) => void;
}) {
  // ✅ dibuat lebih tinggi + lebar supaya grafik memenuhi card
  const width = Math.max(900, rows.length * 220);
  const height = 320;

  const padX = 24;
  const padTop = 24;
  const padBottom = 120;

  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  // Axis = count
  const maxPlan = Math.max(1, ...rows.map((r) => r.planCount));
  const maxCnt = Math.max(1, ...rows.map((r) => r.completeCount));
  const maxY = Math.max(1, maxPlan, maxCnt);

  const toX = (i: number) =>
    padX + ((i + 0.5) / Math.max(1, rows.length)) * innerW;

  const toY = (v: number) => padTop + (1 - v / (maxY || 1)) * innerH;

  const lineD = rows
    .map((r, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(r.planCount)}`)
    .join(" ");

  const barW = Math.max(
    22,
    Math.min(110, innerW / Math.max(1, rows.length) - 20),
  );

  const leftLabel = rows[0]?.label ?? "-";
  const rightLabel = rows[rows.length - 1]?.label ?? "-";

  // ✅ split label jadi max 2 baris biar kebaca
  const wrap2 = (label: string) => {
    const s = String(label ?? "").trim();
    if (!s) return ["-"];

    // kalau pendek, langsung
    if (s.length <= 18) return [s];

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
    const t1 = l1.length > 20 ? l1.slice(0, 20) + "…" : l1;
    const t2 = l2.length > 20 ? l2.slice(0, 20) + "…" : l2;

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

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_inset_0_-12px_20px_rgba(15,23,42,0.06)]">
        {rows.length === 0 ? (
          <div className="p-3 text-sm font-medium text-slate-500">
            Belum ada data.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="w-full">
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  className="h-[320px] w-full"
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
                      const value = Math.max(0, r.completeCount ?? 0);
                      const x = toX(i) - barW / 2;
                      const y = toY(value);
                      const h = padTop + innerH - y;
                      const barH = value === 0 ? 8 : Math.max(0, h);
                      const barY = value === 0 ? padTop + innerH - barH : y;
                      const clickable = Boolean(r.sn && onSelect);
                      const barOpacity = value === 0 ? 0.6 : 0.85;
                      return (
                        <g key={i}>
                          {value >= 3 ? (
                            <>
                              <rect
                                x={x}
                                y={barY}
                                width={barW}
                                height={barH / 3}
                                rx={10}
                                fill="#FACC15"
                                opacity={barOpacity}
                                className={
                                  clickable ? "cursor-pointer" : undefined
                                }
                                onClick={() => {
                                  if (r.sn && onSelect) onSelect(r.sn, r.label);
                                }}
                              />
                              <rect
                                x={x}
                                y={barY + barH / 3}
                                width={barW}
                                height={barH / 3}
                                rx={10}
                                fill="#2563EB"
                                opacity={barOpacity}
                                className={
                                  clickable ? "cursor-pointer" : undefined
                                }
                                onClick={() => {
                                  if (r.sn && onSelect) onSelect(r.sn, r.label);
                                }}
                              />
                              <rect
                                x={x}
                                y={barY + (2 * barH) / 3}
                                width={barW}
                                height={barH / 3}
                                rx={10}
                                fill="#16A34A"
                                opacity={barOpacity}
                                className={
                                  clickable ? "cursor-pointer" : undefined
                                }
                                onClick={() => {
                                  if (r.sn && onSelect) onSelect(r.sn, r.label);
                                }}
                              />
                            </>
                          ) : value >= 2 ? (
                            <>
                              <rect
                                x={x}
                                y={barY}
                                width={barW}
                                height={barH / 2}
                                rx={10}
                                fill="#2563EB"
                                opacity={barOpacity}
                                className={
                                  clickable ? "cursor-pointer" : undefined
                                }
                                onClick={() => {
                                  if (r.sn && onSelect) onSelect(r.sn, r.label);
                                }}
                              />
                              <rect
                                x={x}
                                y={barY + barH / 2}
                                width={barW}
                                height={barH / 2}
                                rx={10}
                                fill="#16A34A"
                                opacity={barOpacity}
                                className={
                                  clickable ? "cursor-pointer" : undefined
                                }
                                onClick={() => {
                                  if (r.sn && onSelect) onSelect(r.sn, r.label);
                                }}
                              />
                            </>
                          ) : (
                            <rect
                              x={x}
                              y={barY}
                              width={barW}
                              height={barH}
                              rx={10}
                              fill="#16A34A"
                              opacity={barOpacity}
                              className={
                                clickable ? "cursor-pointer" : undefined
                              }
                              onClick={() => {
                                if (r.sn && onSelect) onSelect(r.sn, r.label);
                              }}
                            />
                          )}
                          <text
                            x={toX(i)}
                            y={barY - 6}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="800"
                            fill={
                              value >= 3
                                ? "#854D0E"
                                : value >= 2
                                  ? "#1D4ED8"
                                  : "#166534"
                            }
                          >
                            {value}
                          </text>
                        </g>
                      );
                    })}
                  </g>

                  {/* plan line (target count) */}
                  <path
                    d={lineD}
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeDasharray="8 8"
                  />
                  {rows.map((r, i) => (
                    <circle
                      key={i}
                      cx={toX(i)}
                      cy={toY(r.planCount)}
                      r={4.2}
                      fill="#DC2626"
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
                      const clickable = Boolean(r.sn && onSelect);
                      return (
                        <text
                          key={i}
                          x={x}
                          y={y}
                          textAnchor="middle"
                          className={clickable ? "cursor-pointer" : undefined}
                          onClick={() => {
                            if (r.sn && onSelect) onSelect(r.sn, r.label);
                          }}
                        >
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
            </div>

            {/* <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-600">
              <span className="truncate">{leftLabel}</span>
              <span className="truncate">{rightLabel}</span>
            </div> */}

            {/* legend */}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-2">
                <svg
                  width="28"
                  height="10"
                  viewBox="0 0 28 10"
                  className="block"
                >
                  <line
                    x1="1"
                    y1="5"
                    x2="27"
                    y2="5"
                    stroke="#DC2626"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="6 6"
                  />
                </svg>
                Plan
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2.5 w-7 rounded-full bg-emerald-600" />
                Actual
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
  rows,
}: {
  rows: {
    destination: string;
    groupLabel: string;
    planEtd: string;
    planEta: string;
    planDurMin: number;
    actualAvgMin: number | null;
    actualSample: number;

    // delay (boolean saja untuk display)
    delayedAny: boolean;
  }[];
}) {
  const maxV = Math.max(
    1,
    ...rows.map((r) => Math.max(r.planDurMin, r.actualAvgMin ?? 0)),
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
                        {r.groupLabel}
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

function RealtimeMiniBarChart({
  title,
  rows,
  helper,
}: {
  title: string;
  helper?: string;
  rows: { label: string; value: number; colorClass?: string }[];
}) {
  const maxV = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-extrabold text-slate-900">{title}</div>
        {helper ? (
          <div className="text-[11px] font-semibold text-slate-500">
            {helper}
          </div>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((r) => {
          const w = clamp((r.value / maxV) * 100, 6, 100);
          return (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-20 text-xs font-semibold text-slate-600">
                {r.label}
              </div>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.colorClass ?? "bg-blue-600"}`}
                    style={{ width: `${w}%` }}
                  />
                </div>
              </div>
              <div className="w-10 text-right text-xs font-extrabold text-slate-900">
                {r.value}
              </div>
            </div>
          );
        })}
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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const DASHBOARD_LATEST_CACHE_KEY = "dashboard-latest-cache-v1";
  const MAP_CACHE_KEY = "realtime-map-cache-v1";
  const DASHBOARD_TIMELINE_CACHE_KEY = "dashboard-timeline-cache-v1";
  const DASHBOARD_ACTUAL_CACHE_KEY = "dashboard-actual-cache-v3";
  const PLAN_UPDATED_KEY = "plan-updated-at";
  const lastPlanUpdatedRef = useRef(0);
  const deliveryDateRef = useRef<string>(todayWIB());

  const [deliveryDateFilter, setDeliveryDateFilter] =
    useState<string>(todayWIB());

  const [planGroupFilter, setPlanGroupFilter] = useState<string>("ALL");

  const [planFromDb, setPlanFromDb] = useState<PlanMap | null>(null);

  const [latest, setLatest] = useState<DriverStatus[]>([]);

  // ✅ keep last valid realtime payload supaya truck tidak hilang saat API error/429/empty
  const lastOkLatestRef = useRef<DriverStatus[]>([]);
  const didFirstLoadRef = useRef(false);
  const timelineCacheRef = useRef<
    Record<string, Record<string, TimelineCacheEntry>>
  >({});
  const actualCacheRef = useRef<
    Record<
      string,
      {
        counts: Record<string, number>;
        inside: Record<string, boolean>;
        lastArrivalMs: Record<string, number>;
      }
    >
  >({});
  const stopCacheRef = useRef<
    Record<
      string,
      Record<
        string,
        {
          points: Array<{ lat: number; lng: number }>;
          fetchedAt: number;
        }
      >
    >
  >({});
  const addrCacheRef = useRef<Record<string, { addr: string; ts: number }>>({});

  // ✅ hanya yang masih progress (belum complete) + ada posisi
  // NOTE: didefinisikan lebih awal karena dipakai oleh memo lain (activePlateSet/activeDestSet)
  const activeDrivers = useMemo(() => {
    return latest.filter((d) => {
      if (d.lat == null || d.lng == null) return false;
      if (d.isFinished === true) return false; // ✅ COMPLETE => hide
      return true;
    });
  }, [latest]);

  const activeDriversFiltered = useMemo(() => {
    const day = deliveryDateFilter ?? todayWIB();
    const base = activeDrivers.filter((d) => {
      const ymd = ymdFromIsoWib(d.updatedAt);
      return ymd === day;
    });
    if (planGroupFilter === "ALL") return base;
    return base.filter(
      (d) => getCustomerLabelByPlate(d.plate) === planGroupFilter,
    );
  }, [activeDrivers, planGroupFilter, deliveryDateFilter]);

  const timelineDrivers = useMemo(() => {
    if (planGroupFilter === "ALL") return latest;
    return latest.filter(
      (d) => getCustomerLabelByPlate(d.plate) === planGroupFilter,
    );
  }, [latest, planGroupFilter]);

  const fallbackDrivers = useMemo(() => {
    return Object.keys(CUSTOMER_BY_PLATE).map((plate) => ({
      id: plate,
      driverId: plate,
      lat: null,
      lng: null,
      heading: null,
      direction: null,
      origin: null,
      destination: null,
      plate,
      etdTime: null,
      etaTime: null,
      isFinished: false,
      speed: null,
      updatedAt: new Date().toISOString(),
      deliveryDate: deliveryDateFilter ?? todayWIB(),
      driver: { name: plate, phone: null },
    })) as DriverStatus[];
  }, [deliveryDateFilter]);

  const driversForActual = useMemo(() => {
    return activeDriversFiltered.length
      ? activeDriversFiltered
      : fallbackDrivers;
  }, [activeDriversFiltered, fallbackDrivers]);

  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  // stop summary removed
  const [timelineSn, setTimelineSn] = useState<string>("");
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [actualBySn, setActualBySn] = useState<Record<string, number>>({});
  const [arrivalDebug, setArrivalDebug] = useState<
    Array<{
      sn: string;
      plate: string;
      customer: string;
      lat: number | null;
      lng: number | null;
      distM: number | null;
      insideByGeo: boolean;
      addrMatch: boolean;
      insideFinal: boolean;
    }>
  >([]);

  useEffect(() => {
    try {
      const raw =
        window.sessionStorage.getItem(DASHBOARD_LATEST_CACHE_KEY) ??
        window.sessionStorage.getItem(MAP_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const cached = Array.isArray(parsed?.drivers) ? parsed.drivers : [];
      if (!cached.length) return;
      setLatest(cached);
      lastOkLatestRef.current = cached;
      if (!didFirstLoadRef.current) {
        didFirstLoadRef.current = true;
        setLoading(false);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const rawTimeline = window.sessionStorage.getItem(
        DASHBOARD_TIMELINE_CACHE_KEY,
      );
      if (rawTimeline) {
        const parsed = JSON.parse(rawTimeline);
        if (parsed && typeof parsed === "object") {
          timelineCacheRef.current = parsed;
        }
      }
    } catch {}
    try {
      const rawActual =
        window.localStorage.getItem(DASHBOARD_ACTUAL_CACHE_KEY) ??
        window.sessionStorage.getItem(DASHBOARD_ACTUAL_CACHE_KEY);
      if (rawActual) {
        const parsed = JSON.parse(rawActual);
        if (parsed && typeof parsed === "object") {
          actualCacheRef.current = parsed;
        }
      }
      const day = deliveryDateFilter ?? todayWIB();
      const cached = actualCacheRef.current?.[day] ?? null;
      if (cached?.counts && Object.keys(cached.counts).length) {
        setActualBySn(cached.counts);
      } else if (cached && typeof cached === "object") {
        // backward compat: boolean map -> count map
        const legacy: Record<string, boolean> = cached as any;
        const counts: Record<string, number> = {};
        for (const k of Object.keys(legacy)) {
          if (legacy[k]) counts[k] = 1;
        }
        if (Object.keys(counts).length) setActualBySn(counts);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const day = deliveryDateFilter ?? todayWIB();
    const cached = actualCacheRef.current?.[day] ?? null;
    const counts = cached?.counts ?? null;
    if (counts && Object.keys(counts).length) {
      setActualBySn((prev) => ({ ...counts, ...prev }));
    }
  }, [deliveryDateFilter]);

  // ✅ DASHBOARD harus ngikutin kendaraan yang ada di Realtime Map
  // Basisnya: plate/destination yang sedang aktif (activeDrivers)
  const activePlateSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of activeDriversFiltered) s.add(normalizePlate(d.plate));
    return s;
  }, [activeDriversFiltered]);

  const activeDestSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of activeDriversFiltered) {
      const dest = String(d.destination ?? "").trim();
      if (dest) s.add(dest);
    }
    return s;
  }, [activeDriversFiltered]);

  // ✅ history untuk dashboard = hanya yang relevan dengan kendaraan aktif
  // fallback: kalau tidak ada kendaraan aktif, pakai history full
  const dashboardHistoryRows = useMemo(() => {
    if (activeDriversFiltered.length === 0) return historyRows;

    const plateSet = activePlateSet;
    const destSet = activeDestSet;

    return historyRows.filter((r) => {
      const p = normalizePlate(r.plate);
      if (p && p !== "-" && plateSet.has(p)) return true;

      const df = String(r.destinationForward ?? "").trim();
      const dr = String(r.destinationReverse ?? "").trim();
      if (df && destSet.has(df)) return true;
      if (dr && destSet.has(dr)) return true;
      return false;
    });
  }, [historyRows, activeDriversFiltered, activePlateSet, activeDestSet]);

  // ✅ destinasi yang relevan untuk chart (biar chart tidak tampil semua master plan)
  const relevantDestSet = useMemo(() => {
    if (activeDriversFiltered.length === 0) return null as Set<string> | null;

    const s = new Set<string>();

    for (const d of activeDriversFiltered) {
      const dest = String(d.destination ?? "").trim();
      if (dest) s.add(dest);
    }

    for (const r of dashboardHistoryRows) {
      const df = String(r.destinationForward ?? "").trim();
      const dr = String(r.destinationReverse ?? "").trim();
      if (df) s.add(df);
      if (dr) s.add(dr);
    }

    return s;
  }, [activeDriversFiltered, dashboardHistoryRows]);

  const fetchLatest = async () => {
    try {
      setErr(null);

      // ✅ Ambil realtime langsung dari AccuGPS proxy (sama seperti RealtimeMap)
      const res = await fetch("/api/gps/trackers", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const rows = Array.isArray(json?.data) ? json.data : [];

      const nowIso = new Date().toISOString();

      const mapped: DriverStatus[] = rows
        .map((r: any) => {
          const lat = typeof r?.latitude === "number" ? r.latitude : null;
          const lng = typeof r?.longitude === "number" ? r.longitude : null;
          const alias = typeof r?.alias === "string" ? r.alias : null;
          const sn = typeof r?.sn === "string" ? r.sn : String(r?.id ?? "");
          const speed =
            typeof r?.speed === "number" ? r.speed : Number(r?.speed ?? 0) || 0;

          return {
            id: sn,
            driverId: sn,

            lat,
            lng,
            heading: typeof r?.degree === "number" ? r.degree : null,

            // AccuGPS trackers endpoint tidak menyediakan route/ETD/ETA
            direction: null,
            origin: null,
            destination: null,
            plate: alias,
            etdTime: null,
            etaTime: null,
            isFinished: false,
            speed,

            updatedAt: nowIso,
            deliveryDate: null,

            driver: {
              name: alias ?? "-",
              phone: null,
            },
          } as DriverStatus;
        })
        // hanya yang valid posisinya
        .filter((d: DriverStatus) => d.lat != null && d.lng != null);

      // kalau payload kosong/limit, jangan timpa data terakhir yg valid
      if (mapped.length > 0) {
        lastOkLatestRef.current = mapped;
        setLatest(mapped);
      } else {
        if (lastOkLatestRef.current.length > 0)
          setLatest(lastOkLatestRef.current);
        else setLatest([]);
      }
    } catch {
      // error -> jangan kosongkan data realtime
      if (lastOkLatestRef.current.length > 0) {
        setLatest(lastOkLatestRef.current);
      }
      setErr("Gagal memuat data realtime (cek server/API).");
    } finally {
      if (!didFirstLoadRef.current) {
        didFirstLoadRef.current = true;
        setLoading(false);
      }
    }
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
          tripCount:
            typeof p.tripCount === "number" && Number.isFinite(p.tripCount)
              ? Math.max(0, Math.floor(p.tripCount))
              : 0,
          forward: { etd: fEtd, eta: fEta },
          reverse: { etd: rEtd, eta: rEta },
        };
      }

      setPlanFromDb(map);
    } catch {}
  };

  useEffect(() => {
    if (!latest.length) return;
    try {
      window.sessionStorage.setItem(
        DASHBOARD_LATEST_CACHE_KEY,
        JSON.stringify({ drivers: latest, savedAt: Date.now() }),
      );
    } catch {}
  }, [latest]);

  useEffect(() => {
    fetchLatest();
    fetchPlan(deliveryDateFilter);

    const id1 = window.setInterval(fetchLatest, 15000);
    const idP = window.setInterval(
      () => fetchPlan(deliveryDateRef.current),
      120000,
    );

    return () => {
      window.clearInterval(id1);
      window.clearInterval(idP);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    deliveryDateRef.current = deliveryDateFilter;
  }, [deliveryDateFilter]);

  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem(PLAN_UPDATED_KEY) ?? 0);
      if (Number.isFinite(v) && v > 0) lastPlanUpdatedRef.current = v;
    } catch {}
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PLAN_UPDATED_KEY) return;
      fetchPlan(deliveryDateRef.current);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const checkPlanUpdated = () => {
      try {
        const v = Number(window.localStorage.getItem(PLAN_UPDATED_KEY) ?? 0);
        if (Number.isFinite(v) && v > 0 && v > lastPlanUpdatedRef.current) {
          lastPlanUpdatedRef.current = v;
          fetchPlan(deliveryDateRef.current);
        }
      } catch {}
    };

    const onFocus = () => checkPlanUpdated();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkPlanUpdated();
    };

    const id = window.setInterval(checkPlanUpdated, 5000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchPlan(deliveryDateFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryDateFilter]);

  // stop summary removed

  useEffect(() => {
    const list = timelineDrivers.map((d) =>
      String(d.driverId ?? d.id ?? "").trim(),
    );
    if (!list.length) {
      setTimelineSn("");
      setTimelineItems([]);
      setTimelineLoading(false);
      return;
    }
    if (!timelineSn || !list.includes(timelineSn)) {
      setTimelineLoading(true);
      setTimelineItems([]);
      setTimelineSn(list[0]);
    }
  }, [timelineDrivers, timelineSn]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const day = deliveryDateFilter ?? todayWIB();
      const cached = actualCacheRef.current?.[day] ?? {
        counts: {},
        inside: {},
        lastArrivalMs: {},
      };
      const nextCounts: Record<string, number> = { ...cached.counts };
      const nextInside: Record<string, boolean> = { ...cached.inside };
      const nextLastArrivalMs: Record<string, number> = {
        ...cached.lastArrivalMs,
      };

      if (!driversForActual.length) {
        if (!cancelled) setActualBySn(nextCounts);
        return;
      }

      const dayYmd = deliveryDateFilter ?? todayWIB();
      const yesterday = yesterdayWIB();
      const addrLookups = await Promise.all(
        driversForActual.map(async (d) => {
          const sn = String(d.driverId ?? d.id ?? "").trim();
          if (!sn) return { sn, addrMatch: false, inside: false };

          const customer = getCustomerLabelByPlate(d.plate);
          const target = CUSTOMER_DEST_POINTS[customer] ?? null;
          const insideByGeo = isArrivedByPosition(
            { lat: d.lat, lng: d.lng },
            target,
          );
          const distM =
            target && d.lat != null && d.lng != null
              ? haversineMeters(
                  { lat: d.lat, lng: d.lng },
                  { lat: target.lat, lng: target.lng },
                )
              : null;

          // fallback: stop points from timeline (only for non-today)
          let insideByStop = false;
          let stopHitCount = 0;
          if (!isToday) {
            try {
              const stopDayCache = stopCacheRef.current[dayYmd] ?? {};
              const cachedStop = stopDayCache[sn];
              const now = Date.now();
              let stopPoints = cachedStop?.points ?? [];
              const stale =
                !cachedStop || now - cachedStop.fetchedAt > STOP_CACHE_TTL_MS;

              if (stale) {
                const res = await fetch(
                  `/api/gps/timeline?sn=${encodeURIComponent(
                    sn,
                  )}&date=${encodeURIComponent(dayYmd)}&maxPoints=2500`,
                  { cache: "no-store" },
                );
                if (res.ok) {
                  const json = await res.json();
                  const stops = Array.isArray(json?.stops) ? json.stops : [];
                  stopPoints = takeTopStops(stops, 3);
                  stopCacheRef.current = {
                    ...stopCacheRef.current,
                    [dayYmd]: {
                      ...stopDayCache,
                      [sn]: { points: stopPoints, fetchedAt: now },
                    },
                  };
                }
              }

              // fallback to yesterday if selected day has none
              if (!stopPoints.length && dayYmd !== yesterday) {
                const yCache = stopCacheRef.current[yesterday] ?? {};
                const yCached = yCache[sn];
                let yPoints = yCached?.points ?? [];
                const yStale =
                  !yCached || now - yCached.fetchedAt > STOP_CACHE_TTL_MS;
                if (yStale) {
                  const resY = await fetch(
                    `/api/gps/timeline?sn=${encodeURIComponent(
                      sn,
                    )}&date=${encodeURIComponent(yesterday)}&maxPoints=2500`,
                    { cache: "no-store" },
                  );
                  if (resY.ok) {
                    const jsonY = await resY.json();
                    const stopsY = Array.isArray(jsonY?.stops)
                      ? jsonY.stops
                      : [];
                    yPoints = takeTopStops(stopsY, 3);
                    stopCacheRef.current = {
                      ...stopCacheRef.current,
                      [yesterday]: {
                        ...yCache,
                        [sn]: { points: yPoints, fetchedAt: now },
                      },
                    };
                  }
                }
                stopPoints = stopPoints.length ? stopPoints : yPoints;
              }

              if (target && stopPoints.length) {
                stopHitCount = stopPoints.filter((p) => {
                  const dist = haversineMeters(
                    { lat: p.lat, lng: p.lng },
                    { lat: target.lat, lng: target.lng },
                  );
                  const radius = target?.radiusM ?? ARRIVAL_RADIUS_M;
                  return dist <= radius;
                }).length;
                insideByStop = stopHitCount > 0;
              }
            } catch {}
          }

          return {
            sn,
            addrMatch: false,
            inside: insideByGeo || insideByStop,
            stopHitCount,
            debug: {
              sn,
              plate: normalizePlate(d.plate) || "-",
              customer,
              lat: d.lat ?? null,
              lng: d.lng ?? null,
              distM,
              insideByGeo: insideByGeo || insideByStop,
              addrMatch: false,
              insideFinal: insideByGeo || insideByStop,
            },
          };
        }),
      );

      const debugRows: typeof arrivalDebug = [];
      for (const r of addrLookups) {
        const sn = r.sn;
        if (!sn) continue;
        const inside = r.inside;
        const wasInside = Boolean(nextInside[sn]);
        const curCount = nextCounts[sn] ?? 0;

        // ✅ jika sudah di dalam saat pertama load, isi minimal 1
        if (inside && curCount === 0) {
          nextCounts[sn] = 1;
          nextLastArrivalMs[sn] = nextLastArrivalMs[sn] ?? Date.now();
        }

        if (inside && !wasInside) {
          const nowMs = Date.now();
          const lastMs = Number(nextLastArrivalMs[sn] ?? 0);
          const cooldownMs = ARRIVAL_COOLDOWN_MIN * 60 * 1000;
          if (!lastMs || nowMs - lastMs >= cooldownMs) {
            nextCounts[sn] = (nextCounts[sn] ?? 0) + 1;
            nextLastArrivalMs[sn] = nowMs;
          }
        }
        if (
          typeof (r as any).stopHitCount === "number" &&
          (r as any).stopHitCount > 0
        ) {
          const next = Math.max(nextCounts[sn] ?? 0, (r as any).stopHitCount);
          if (next > (nextCounts[sn] ?? 0)) nextCounts[sn] = next;
        }
        nextInside[sn] = inside;
        if (r.debug) debugRows.push(r.debug);
      }

      if (cancelled) return;
      setActualBySn(nextCounts);
      setArrivalDebug(debugRows);
      actualCacheRef.current = {
        ...actualCacheRef.current,
        [day]: {
          counts: nextCounts,
          inside: nextInside,
          lastArrivalMs: nextLastArrivalMs,
        },
      };
      try {
        window.localStorage.setItem(
          DASHBOARD_ACTUAL_CACHE_KEY,
          JSON.stringify(actualCacheRef.current),
        );
      } catch {}
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [driversForActual, deliveryDateFilter]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!timelineSn) {
        setTimelineItems([]);
        setTimelineLoading(false);
        return;
      }
      const day = deliveryDateFilter ?? todayWIB();
      const cached = timelineCacheRef.current?.[day]?.[timelineSn] ?? null;
      if (cached?.items?.length) {
        setTimelineItems(cached.items);
        setTimelineLoading(false);
      } else {
        setTimelineItems([]);
        setTimelineLoading(true);
      }
      try {
        const res = await fetch(
          `/api/gps/timeline?sn=${encodeURIComponent(timelineSn)}&date=${encodeURIComponent(
            day,
          )}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cached?.items?.length) setTimelineItems([]);
          return;
        }
        const json = await res.json();
        if (cancelled) return;

        const tl0: any[] = Array.isArray(json?.timeline) ? json.timeline : [];
        const hasStop = tl0.some((x) => x?.type === "STOP");
        const stops0: any[] = Array.isArray(json?.stops) ? json.stops : [];
        const tlStops: any[] =
          !hasStop && stops0.length
            ? stops0.map((s: any, i: number) => {
                const startSec = getStopStartSec(s);
                const endSec = getStopEndSec(s);
                const durationSec =
                  typeof s?.durationSec === "number"
                    ? s.durationSec
                    : startSec != null && endSec != null && endSec >= startSec
                      ? endSec - startSec
                      : 0;
                return {
                  type: "STOP",
                  stopNo: Number(s?.stopNo ?? i + 1),
                  startSec,
                  endSec,
                  durationSec,
                  address: String(s?.address ?? "").trim(),
                };
              })
            : [];

        const merged = [...tl0, ...tlStops]
          .filter((x) => x && (x.type === "DRIVE" || x.type === "STOP"))
          .sort((a, b) => Number(a?.startSec ?? 0) - Number(b?.startSec ?? 0));

        const items = merged.map((it) => ({
          type: it.type,
          startSec: it.startSec,
          durationSec: it.durationSec ?? 0,
          distanceMeters: it.distanceMeters ?? 0,
          address: it.address ?? "",
        }));

        const { hasRelevant, hasDrive } = analyzeTimelineItems(items);
        if (hasRelevant || !cached?.items?.length) {
          setTimelineItems(items);
        }
        if (hasRelevant || !cached?.items?.length) {
          if (!timelineCacheRef.current[day]) {
            timelineCacheRef.current[day] = {};
          }
          timelineCacheRef.current[day][timelineSn] = {
            items,
            savedAt: Date.now(),
            hasRelevant,
            hasDrive,
          };
          try {
            window.sessionStorage.setItem(
              DASHBOARD_TIMELINE_CACHE_KEY,
              JSON.stringify(timelineCacheRef.current),
            );
          } catch {}
        }
      } catch {
        if (!cancelled && !cached?.items?.length) setTimelineItems([]);
      } finally {
        if (!cancelled) setTimelineLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [timelineSn, deliveryDateFilter]);

  const activeDriversCount = activeDriversFiltered.length;

  const activeTrucksCount = useMemo(() => {
    const set = new Set<string>();
    for (const d of activeDriversFiltered) if (d.plate) set.add(d.plate);
    return set.size;
  }, [activeDriversFiltered]);

  const lastUpdateIso = useMemo(() => {
    let max: string | null = null;
    for (const d of activeDriversFiltered)
      if (!max || d.updatedAt > max) max = d.updatedAt;
    return max;
  }, [activeDriversFiltered]);

  // ✅ pilih plan yang dipakai: DB > fallback
  const effectivePlan: PlanMap = useMemo(() => {
    if (planFromDb) return planFromDb;

    // fallback: reverse disamakan dengan forward (karena plan master lama hanya 1 set)
    const map: PlanMap = {};
    for (const dest of Object.keys(PLAN_BY_DEST)) {
      map[dest] = {
        group: PLAN_BY_DEST[dest].group,
        tripCount: 0,
        forward: { etd: PLAN_BY_DEST[dest].etd, eta: PLAN_BY_DEST[dest].eta },
        reverse: { etd: PLAN_BY_DEST[dest].etd, eta: PLAN_BY_DEST[dest].eta },
      };
    }
    return map;
  }, [planFromDb]);

  const availableGroups = useMemo(() => {
    const s = new Set<string>();
    for (const d of activeDrivers) {
      const label = getCustomerLabelByPlate(d.plate);
      if (label) s.add(label);
    }
    for (const r of historyRows) {
      const label = getCustomerLabelByPlate(r.plate);
      if (label) s.add(label);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [activeDrivers, historyRows]);

  const groupByDestination = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of dashboardHistoryRows) {
      const dest = (r.destinationForward ?? "").trim();
      if (!dest) continue;
      const label = getCustomerLabelByPlate(r.plate);
      if (label && !m.has(dest)) m.set(dest, label);
    }
    return m;
  }, [dashboardHistoryRows]);

  // ✅ Plan vs Actual (delivery count) from realtime
  const planActualDeliveryRows = useMemo(() => {
    const tripByGroup = new Map<string, number>();
    for (const dest of Object.keys(effectivePlan)) {
      const plan = effectivePlan[dest];
      const g = String(plan?.group ?? "").trim();
      if (!g) continue;
      const v = Number(plan?.tripCount ?? 0);
      const next = (tripByGroup.get(g) ?? 0) + (Number.isFinite(v) ? v : 0);
      tripByGroup.set(g, next);
    }
    const tripByPlate = new Map<string, number>();
    for (const dest of Object.keys(effectivePlan)) {
      const plan = effectivePlan[dest];
      const plate = extractPlateFromDestination(dest);
      if (!plate || plate === "-") continue;
      const v = Number(plan?.tripCount ?? 0);
      const next = (tripByPlate.get(plate) ?? 0) + (Number.isFinite(v) ? v : 0);
      tripByPlate.set(plate, next);
    }

    const rows = driversForActual
      .map((d) => {
        const plate =
          normalizePlate(d.plate) || String(d.driverId ?? d.id ?? "");
        const customer = getCustomerLabelByPlate(d.plate);
        const label =
          customer && customer !== "-" ? `${plate} (${customer})` : plate;
        const sn = String(d.driverId ?? d.id ?? "").trim();
        const planCount =
          tripByPlate.get(plate) ??
          (customer ? (tripByGroup.get(customer) ?? 0) : 0);
        return {
          label,
          planCount,
          completeCount: actualBySn[sn] ?? 0,
          sn,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return rows;
  }, [driversForActual, actualBySn, effectivePlan]);

  const movingStoppedRows = useMemo(() => {
    const total = activeDriversFiltered.length;
    const moving = activeDriversFiltered.filter(
      (d) => (typeof d.speed === "number" ? d.speed : 0) > 3,
    ).length;
    const stopped = Math.max(0, total - moving);
    return [
      { label: "Moving", value: moving, colorClass: "bg-emerald-600" },
      { label: "Stopped", value: stopped, colorClass: "bg-rose-500" },
    ];
  }, [activeDriversFiltered]);

  const movingCount = movingStoppedRows[0]?.value ?? 0;
  const stoppedCount = movingStoppedRows[1]?.value ?? 0;

  const speedBucketRows = useMemo(() => {
    const buckets = [
      { label: "0-3", min: 0, max: 3, colorClass: "bg-slate-400" },
      { label: "3-10", min: 3, max: 10, colorClass: "bg-sky-500" },
      { label: "10-30", min: 10, max: 30, colorClass: "bg-blue-600" },
      { label: "30-60", min: 30, max: 60, colorClass: "bg-emerald-600" },
      { label: "60+", min: 60, max: Infinity, colorClass: "bg-amber-500" },
    ];
    const counts = buckets.map((b) => ({ ...b, value: 0 }));
    for (const d of activeDriversFiltered) {
      const s = typeof d.speed === "number" ? d.speed : 0;
      const b = counts.find((x) => s > x.min && s <= x.max) ?? counts[0];
      b.value += 1;
    }
    return counts.map(({ label, value, colorClass }) => ({
      label,
      value,
      colorClass,
    }));
  }, [activeDriversFiltered]);

  // ✅ rows untuk Plan vs Actual (pakai forward)
  const planVsActualRows = useMemo(() => {
    const dests = Object.keys(effectivePlan).filter((dest) => {
      if (relevantDestSet && !relevantDestSet.has(dest)) return false;

      const g = groupByDestination.get(dest) ?? "";
      if (planGroupFilter === "ALL") return true;
      return g === planGroupFilter;
    });

    const buckets = new Map<string, number[]>();
    const delayedDest = new Set<string>();

    for (const r of dashboardHistoryRows) {
      const dest = (r.destinationForward ?? "").trim();

      if (!dest || !effectivePlan[dest]) continue;

      const g = groupByDestination.get(dest) ?? "";
      if (planGroupFilter !== "ALL" && g !== planGroupFilter) continue;

      // duration actual (forward)
      const etdA = r.etdForward;
      const etaA = r.etaForward;

      const dur = diffMin(etdA, etaA);
      if (dur != null) {
        const arr = buckets.get(dest) ?? [];
        arr.push(dur);
        buckets.set(dest, arr);
      }

      // delay check vs plan (ETD atau ETA lewat plan)
      const plan = effectivePlan[dest]?.forward;
      const de = delayMin(plan?.etd, etdA);
      const da = delayMin(plan?.eta, etaA);
      if ((de != null && de > 0) || (da != null && da > 0)) {
        delayedDest.add(dest);
      }
    }

    return dests
      .map((dest) => {
        const plan = effectivePlan[dest]?.forward;
        const planEtd = normalizeTimeHHmm(plan?.etd ?? "-");
        const planEta = normalizeTimeHHmm(plan?.eta ?? "-");
        const planDur = diffMin(planEtd, planEta) ?? 0;

        const arr = buckets.get(dest) ?? [];
        const avg =
          arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

        return {
          destination: dest,
          groupLabel: groupByDestination.get(dest) ?? "-",
          planEtd,
          planEta,
          planDurMin: planDur,
          actualAvgMin: avg,
          actualSample: arr.length,
          delayedAny: delayedDest.has(dest),
        };
      })
      .sort((a, b) => a.destination.localeCompare(b.destination));
  }, [
    dashboardHistoryRows,
    planGroupFilter,
    effectivePlan,
    relevantDestSet,
    groupByDestination,
  ]);

  // ✅ Overall delivery complete: bandingkan target plan (1/destinasi) vs aktual (jumlah delivery complete)
  const overallCompleteRows = useMemo(() => {
    const dests = Object.keys(effectivePlan).filter((dest) => {
      if (relevantDestSet && !relevantDestSet.has(dest)) return false;

      const g = groupByDestination.get(dest) ?? "";
      if (planGroupFilter === "ALL") return true;
      return g === planGroupFilter;
    });

    // complete count per destination (ambil dari history complete)
    const cntMap = new Map<string, number>();

    for (const r of dashboardHistoryRows) {
      if (!r.isComplete) continue;

      // destination untuk grouping cukup pakai forward (master destinasi)
      const dest = (r.destinationForward ?? "").trim();
      if (!dest || !effectivePlan[dest]) continue;

      const g = groupByDestination.get(dest) ?? "";
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
  }, [
    dashboardHistoryRows,
    effectivePlan,
    planGroupFilter,
    relevantDestSet,
    groupByDestination,
  ]);

  // ✅ History filter: Group (based on actual customer label)
  const filteredHistoryRows = useMemo(() => {
    if (planGroupFilter === "ALL") return dashboardHistoryRows;

    return dashboardHistoryRows.filter((r) => {
      const g = getCustomerLabelByPlate(r.plate);
      return g === planGroupFilter;
    });
  }, [dashboardHistoryRows, planGroupFilter]);

  // ✅ A: On-time vs Delay summary (forward)
  const onTimeDelaySummary = useMemo(() => {
    let onTime = 0;
    let delayed = 0;
    let noData = 0;

    for (const r of filteredHistoryRows) {
      const dest = (r.destinationForward ?? "").trim();

      if (!dest || !effectivePlan[dest]) continue;

      const plan = effectivePlan[dest]?.forward;
      const planEtd = plan?.etd ?? null;
      const planEta = plan?.eta ?? null;

      const etdA = r.etdForward;
      const etaA = r.etaForward;

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
  }, [filteredHistoryRows, effectivePlan]);

  // ✅ C: Top delay destinations (avg delay minutes) - Top 5
  const topDelayDestinations = useMemo(() => {
    const map = new Map<string, number[]>();

    for (const r of filteredHistoryRows) {
      const dest = (r.destinationForward ?? "").trim();

      if (!dest || !effectivePlan[dest]) continue;

      const plan = effectivePlan[dest]?.forward;
      const etdA = r.etdForward;
      const etaA = r.etaForward;

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
  }, [filteredHistoryRows, effectivePlan]);

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            title="Moving Trucks"
            value={loading ? "-" : movingCount}
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
            title="Stopped Trucks"
            value={loading ? "-" : stoppedCount}
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
        </div>

        {/* ✅ Global Filter (dipakai untuk semua section) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex w-full justify-end">
            {/* Date */}
            <div className="flex w-fit items-center justify-start gap-2 rounded-2xl border border-slate-200 bg-white p-2">
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
          </div>
        </div>

        {/* ✅ Plan vs Actual + Toggle Forward/Reverse */}
        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white via-white to-slate-50 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08),_0_2px_6px_rgba(15,23,42,0.06)] ring-1 ring-white/70 transition-all duration-150 active:translate-y-0.5 active:shadow-[0_4px_14px_rgba(15,23,42,0.08),_0_1px_4px_rgba(15,23,42,0.06)]">
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
              <PlanLineActualBarChart
                badgeLabel="Plan vs Actual (Delivery)"
                rows={planActualDeliveryRows}
                onSelect={(sn) => {
                  router.push(`/live?sn=${encodeURIComponent(sn)}`);
                }}
              />
            </div>

            {typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("debugArrival") ===
              "1" ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <div className="mb-2 font-extrabold text-slate-900">
                  Arrival Debug
                </div>
                {arrivalDebug.length === 0 ? (
                  <div>Belum ada data arrival debug.</div>
                ) : (
                  <div className="space-y-1">
                    {arrivalDebug.map((r) => (
                      <div key={r.sn}>
                        {r.plate} • {r.customer} • {r.lat?.toFixed(4)},{" "}
                        {r.lng?.toFixed(4)} • dist{" "}
                        {r.distM ? Math.round(r.distM) : "-"}m • geo{" "}
                        {String(r.insideByGeo)} • addr {String(r.addrMatch)} •
                        final {String(r.insideFinal)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* ✅ Realtime Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RealtimeMiniBarChart
            title="Moving vs Stopped"
            helper="Realtime"
            rows={movingStoppedRows}
          />
          <RealtimeMiniBarChart
            title="Speed Distribution"
            helper="km/h"
            rows={speedBucketRows}
          />
        </div>
      </div>
    </div>
  );
}

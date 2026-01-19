// src/app/components/RealtimeMap.tsx

"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  CircleMarker,
  Popup,
} from "react-leaflet";
import L from "leaflet";

type DriverStatus = {
  id: string;
  driverId: string;

  plate: string | null;

  direction?: "forward" | "reverse" | null;
  origin?: string | null;
  destination?: string | null;

  etdTime?: string | null;
  etaTime?: string | null;

  lat: number | null;
  lng: number | null;
  heading: number | null;
  speed?: number | null;

  updatedAt: string;
  isFinished?: boolean | null;

  driver: {
    name: string;
    phone?: string | null;
  };
};

type LatLng = { lat: number; lng: number };
type LatLngT = { lat: number; lng: number; t?: number | string | null };
type PathsByDriver = Record<string, LatLng[]>;

type HistoryPoint = {
  lat: number;
  lng: number;
  t?: number | string | null;
  speed?: number | null;
};

type HistoryStop = {
  lat: number;
  lng: number;
  t?: number | string | null;
  speed?: number | null;
  distance?: number | null;

  // beberapa endpoint kamu pakai ini
  startTime?: number | null;
  endTime?: number | null;
  durationSec?: number | null;

  // beberapa bentuk lain (fallback)
  startSec?: number | null;
  endSec?: number | null;

  // field accugps asli (umum)
  start_time?: number | null;
  start_driving_time?: number | null;

  // alamat dari GPS (kalau ada)
  name?: string | null;
  // alamat dari timeline API (kalau ada)
  address?: string | null;
};

type HistoryBySn = Record<
  string,
  {
    points: HistoryPoint[];
    stops: HistoryStop[];
    fetchedAt: number;
    date?: string | null;
  }
>;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function dedupeTrailing(points: LatLng[], epsMeters: number) {
  if (!Array.isArray(points) || points.length < 2) return points;
  const out: LatLng[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last) {
      out.push(p);
      continue;
    }
    if (haversineMeters(last, p) > epsMeters) out.push(p);
  }
  return out;
}

function cleanOutliers(points: LatLng[], maxJumpMeters: number) {
  if (!Array.isArray(points) || points.length < 2) return points;
  const out: LatLng[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last) {
      out.push(p);
      continue;
    }
    const d = haversineMeters(last, p);
    if (d <= maxJumpMeters) out.push(p);
  }
  return out;
}

function appendPointSmooth(
  existing: LatLng[],
  nextPoint: LatLng,
  dtSec: number,
) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const last = out[out.length - 1];

  if (last && haversineMeters(last, nextPoint) < 5) return out;

  const maxKmh = 170;
  const maxMeters = Math.max(120, (maxKmh / 3.6) * Math.max(1, dtSec));
  if (last) {
    const d = haversineMeters(last, nextPoint);
    if (d > maxMeters) return out;
  }

  if (out.length >= 2) {
    const prev = out[out.length - 2];
    const dPrev = haversineMeters(prev, nextPoint);
    const dLastPrev = last ? haversineMeters(prev, last) : Infinity;
    if (dPrev < 15 && dLastPrev < 40) {
      out[out.length - 1] = nextPoint;
      return out;
    }
  }

  out.push(nextPoint);
  return out;
}

function thinPathByDistance(points: LatLng[], minMeters: number) {
  if (!Array.isArray(points) || points.length <= 2) return points;
  const out: LatLng[] = [];
  let last: LatLng | null = null;
  for (const p of points) {
    if (!p) continue;
    if (!last) {
      out.push(p);
      last = p;
      continue;
    }
    const d = haversineMeters(last, p);
    if (d >= minMeters) {
      out.push(p);
      last = p;
    }
  }
  const tail = points[points.length - 1];
  if (tail && out.length) {
    const lastOut = out[out.length - 1];
    if (!lastOut || lastOut.lat !== tail.lat || lastOut.lng !== tail.lng)
      out.push(tail);
  }
  return out;
}

function keepLastN<T>(points: T[], maxPoints: number) {
  if (!Array.isArray(points)) return [];
  if (points.length <= maxPoints) return points;
  return points.slice(points.length - maxPoints);
}

function fitBoundsSafe(map: any, pts: LatLng[]) {
  try {
    if (!map || !Array.isArray(pts) || pts.length < 2) return;
    const bounds = (L as any).latLngBounds(pts.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  } catch {}
}

function fmtDurationMinutesFromSec(sec?: number | null) {
  if (sec == null) return "-";
  const n = Number(sec);
  if (!Number.isFinite(n) || n < 0) return "-";
  const s = Math.floor(n);
  const m = Math.floor(s / 60);
  return `${m} menit`;
}

function fmtTimeWib(t?: number | string | null) {
  if (t == null) return "-";
  let ms: number | null = null;
  if (typeof t === "number" && Number.isFinite(t)) {
    ms = t > 10_000_000_000 ? t : t * 1000;
  } else if (typeof t === "string") {
    const p = Date.parse(t);
    ms = Number.isFinite(p) ? p : null;
  }
  if (ms == null) return String(t);
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleTimeString();
  }
}

function fmtTimeWibNoSec(t?: number | string | null) {
  if (t == null) return "-";
  let ms: number | null = null;
  if (typeof t === "number" && Number.isFinite(t)) {
    ms = t > 10_000_000_000 ? t : t * 1000;
  } else if (typeof t === "string") {
    const p = Date.parse(t);
    ms = Number.isFinite(p) ? p : null;
  }
  if (ms == null) return String(t);
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleTimeString();
  }
}

function fmtDateTimeWib(t?: number | string | null) {
  if (t == null) return "-";
  let ms: number | null = null;
  if (typeof t === "number" && Number.isFinite(t)) {
    ms = t > 10_000_000_000 ? t : t * 1000;
  } else if (typeof t === "string") {
    const p = Date.parse(t);
    ms = Number.isFinite(p) ? p : null;
  }
  if (ms == null) return String(t);
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function coordKey(lat: number, lng: number) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function ymdJakartaClient(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`; // YYYY-MM-DD
}

function ymdJakartaClientOffsetDays(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return ymdJakartaClient(d);
}

function toDateTimeInput(ymd: string, hh: string, mm: string) {
  return `${ymd}T${hh}:${mm}`;
}

function parseJakartaLocalToSec(date: string, time: string): number | null {
  if (!date || !time) return null;
  const ms = Date.parse(`${date}T${time}:00+07:00`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

type RealtimeMapProps = {
  sidebarOpen?: boolean;
  drivers?: DriverStatus[];
  destFilter?: string;
  onDestFilterChange?: (v: string) => void;
};

const CUSTOMER_BY_PLATE: Record<string, string> = {
  "T 9521 AB": "Yamaha Pulogadung Lokal",
  "T 9473 AB": "Yamaha Karawang",
  "T 8854 DH": "Yamaha Pg export",
  "T 9508 AB": "Yamaha Karawang",
  "T 9472 AB": "Yamaha Pulogadung Lokal",
};

function cleanPlate(raw?: string | null) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const idx = s.indexOf(" - ");
  return idx >= 0 ? s.slice(0, idx).trim() : s;
}

function getCustomerLabel(plate?: string | null) {
  const key = cleanPlate(plate).toUpperCase();
  return CUSTOMER_BY_PLATE[key] ?? "-";
}

function toNum(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeCoordClient(v: number) {
  if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) > 180) {
    return v / 3600000;
  }
  return v;
}

const MapContainerAny = MapContainer as unknown as any;
const TileLayerAny = TileLayer as unknown as any;
const MarkerAny = Marker as unknown as any;
const TooltipAny = Tooltip as unknown as any;
const PolylineAny = Polyline as unknown as any;
const CircleMarkerAny = CircleMarker as unknown as any;
const PopupAny = Popup as unknown as any;

// Helper icon builders for stop numbers, start, and end
function makeStopNumberIcon(n: number) {
  const html = `
    <div style="position:relative; width:34px; height:34px;">
      <div style="position:absolute; inset:0; border-radius:9999px; background:#DC2626; box-shadow:0 6px 16px rgba(0,0,0,.25); border:3px solid #fff;"></div>
      <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; color:#fff;">${n}</div>
    </div>
  `;
  return (L as any).divIcon({
    html,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34],
  });
}

function makeStartIcon() {
  const html = `
    <div style="display:flex; align-items:center; gap:8px; transform:translateY(-2px);">
      <div style="width:30px; height:30px; border-radius:9999px; background:#16A34A; border:3px solid #fff; box-shadow:0 6px 16px rgba(0,0,0,.25); display:flex; align-items:center; justify-content:center;">
        <div style="width:10px; height:10px; border-radius:9999px; background:#fff;"></div>
      </div>
      <div style="padding:4px 8px; background:#fff; border:1px solid #E2E8F0; border-radius:9999px; font-size:12px; font-weight:800; color:#16A34A; box-shadow:0 6px 16px rgba(0,0,0,.12);">Start</div>
    </div>
  `;
  return (L as any).divIcon({
    html,
    className: "",
    iconSize: [90, 34],
    iconAnchor: [15, 34],
    popupAnchor: [0, -34],
  });
}

function makeEndIcon() {
  const html = `
    <div style="display:flex; align-items:center; gap:8px; transform:translateY(-2px);">
      <div style="width:30px; height:30px; border-radius:9999px; background:#0F172A; border:3px solid #fff; box-shadow:0 6px 16px rgba(0,0,0,.25); display:flex; align-items:center; justify-content:center;">
        <div style="width:10px; height:10px; border-radius:9999px; background:#fff;"></div>
      </div>
      <div style="padding:4px 8px; background:#fff; border:1px solid #E2E8F0; border-radius:9999px; font-size:12px; font-weight:800; color:#0F172A; box-shadow:0 6px 16px rgba(0,0,0,.12);">End</div>
    </div>
  `;
  return (L as any).divIcon({
    html,
    className: "",
    iconSize: [80, 34],
    iconAnchor: [15, 34],
    popupAnchor: [0, -34],
  });
}

const MAP_CACHE_KEY = "realtime-map-cache-v1";

// ===== helpers: stop duration & time extraction (robust) =====
function normEpochSecMaybe(v: number) {
  return v > 10_000_000_000 ? Math.floor(v / 1000) : Math.floor(v);
}

function getStopStartSec(s: any): number | null {
  const v =
    toNum(s?.start_time) ??
    toNum(s?.startSec) ??
    toNum(s?.startTime) ??
    toNum(s?.t) ??
    null;
  if (v == null) return null;
  return normEpochSecMaybe(v);
}

function getStopEndSec(s: any): number | null {
  const v =
    toNum(s?.start_driving_time) ??
    toNum(s?.endSec) ??
    toNum(s?.endTime) ??
    null;
  if (v == null) return null;
  return normEpochSecMaybe(v);
}

function getStopDurationSec(s: any): number {
  const direct = toNum(s?.durationSec);
  if (direct != null && direct > 0) return Math.max(0, Math.floor(direct));

  // accugps: start_time & start_driving_time
  const a = toNum(s?.start_time);
  const b = toNum(s?.start_driving_time);
  if (a != null && b != null) {
    const as = normEpochSecMaybe(a);
    const bs = normEpochSecMaybe(b);
    return Math.max(0, bs - as);
  }

  // fallback dari start/end yang lain
  const start = getStopStartSec(s);
  const end = getStopEndSec(s);
  if (start != null && end != null) return Math.max(0, end - start);

  return 0;
}

function pickTripReplayStops(data: any): any[] {
  if (!data) return [];
  const tl = Array.isArray(data?.timeline) ? data.timeline : [];
  const hasStop = tl.some((x: any) => x?.type === "STOP");
  if (hasStop) return tl.filter((x: any) => x?.type === "STOP");
  const stops0 = Array.isArray(data?.stops) ? data.stops : [];
  return stops0;
}

function getStopNameFromGps(s: any): string {
  const n1 = String(s?.name ?? "").trim();
  if (n1) return n1;
  const n2 = String(s?.address ?? "").trim();
  if (n2) return n2;
  return "";
}

export default function RealtimeMap({
  sidebarOpen,
  drivers: driversProp,
  destFilter: destFilterProp,
  onDestFilterChange,
}: RealtimeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // IMPORTANT: keep Leaflet map instance in a dedicated ref.
  // Do NOT pass this ref into <MapContainer>, because React may overwrite it with a DOM node.
  const leafletMapRef = useRef<any>(null);

  const [driversInternal, setDriversInternal] = useState<DriverStatus[]>([]);
  const [paths, setPaths] = useState<Record<string, LatLng[]>>({});
  const lastOkRef = useRef<DriverStatus[]>([]);
  const [snappedPaths, setSnappedPaths] = useState<Record<string, LatLng[]>>(
    {},
  );

  const [selectedSn, setSelectedSn] = useState<string | null>(null);

  const [historyBySn, setHistoryBySn] = useState<HistoryBySn>({});
  const [matchedHistoryPaths, setMatchedHistoryPaths] = useState<
    Record<string, LatLng[]>
  >({});

  const [selectedStopKey, setSelectedStopKey] = useState<string | null>(null);
  const [stopAddrByKey, setStopAddrByKey] = useState<
    Record<string, { name: string; fetchedAt: number }>
  >({});
  const inFlightAddrRef = useRef<Record<string, boolean>>({});

  const [driverAddrBySn, setDriverAddrBySn] = useState<
    Record<string, { name: string; coordKey: string; fetchedAt: number }>
  >({});
  const inFlightDriverAddrRef = useRef<Record<string, boolean>>({});

  const [destFilterInternal, setDestFilterInternal] = useState<string>("ALL");
  const [mapStyle, setMapStyle] = useState<"street" | "satellite">("street");

  // Trip replay UI
  const [tripReplayOpen, setTripReplayOpen] = useState(false);
  const [tripReplaySn, setTripReplaySn] = useState<string | null>(null);
  const [tripReplayDate, setTripReplayDate] = useState<string>(() =>
    ymdJakartaClient(),
  );
  const [tripReplayFromDate, setTripReplayFromDate] = useState<string>(() =>
    ymdJakartaClient(),
  );
  const [tripReplayFromTime, setTripReplayFromTime] = useState<string>("00:00");
  const [tripReplayToDate, setTripReplayToDate] = useState<string>(() =>
    ymdJakartaClient(),
  );
  const [tripReplayToTime, setTripReplayToTime] = useState<string>("23:59");
  const [tripReplayLoading, setTripReplayLoading] = useState(false);
  const [tripReplayData, setTripReplayData] = useState<any | null>(null);
  const [tripReplayErr, setTripReplayErr] = useState<string | null>(null);
  const [tripReplayQuery, setTripReplayQuery] = useState("");
  const [tripReplayTypeFilter, setTripReplayTypeFilter] = useState<
    "ALL" | "DRIVE" | "STOP"
  >("ALL");

  const [tripReplayRunKey, setTripReplayRunKey] = useState(0);

  const lastTelemetryRef = useRef<
    Record<string, { p?: LatLng; tMs?: number; speedKmh?: number }>
  >({});
  const inFlightHistoryRef = useRef<Record<string, boolean>>({});
  const lastMatchHashRef = useRef<Record<string, string>>({});

  // realtime route controls (biar ringan)
  const ROUTE_MAX_POINTS = 140;
  const ROUTE_MIN_SPACING_M = 25;

  // history (harian) jangan terlalu agresif
  const HISTORY_MAX_JUMP_M = 5000;
  const HISTORY_MIN_SPACING_M = 20;
  const HISTORY_MAX_DRAW_POINTS = 2500;

  const drivers = Array.isArray(driversProp) ? driversProp : driversInternal;
  const effectiveDestFilter =
    typeof destFilterProp === "string" ? destFilterProp : destFilterInternal;

  const setDestFilter = (v: string) => {
    if (onDestFilterChange) onDestFilterChange(v);
    else setDestFilterInternal(v);
  };

  const visibleDrivers = useMemo(() => {
    const base = drivers.filter((d) => {
      if (d.lat == null || d.lng == null) return false;
      if (d.isFinished === true) return false;
      return true;
    });

    if (effectiveDestFilter === "ALL") return base;

    return base.filter(
      (d) => getCustomerLabel(d.plate) === effectiveDestFilter,
    );
  }, [drivers, effectiveDestFilter]);

  const trackerOptions = useMemo(() => {
    // gunakan semua driver yang terlihat agar mudah dipilih
    return visibleDrivers
      .map((d) => ({
        sn: String(d.driverId ?? d.id ?? "").trim(),
        label: cleanPlate(d.plate) || String(d.driverId ?? d.id ?? "-").trim(),
      }))
      .filter((x) => x.sn)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleDrivers]);

  const toggleSelect = useCallback((sn: string) => {
    setSelectedSn((prev) => {
      const next = prev === sn ? null : sn;
      if (next == null) setSelectedStopKey(null);
      return next;
    });
  }, []);

  const openTripReplay = useCallback((sn: string) => {
    setTripReplaySn(sn);
    const ymd = ymdJakartaClient();
    setTripReplayDate(ymd);
    setTripReplayFromDate(ymd);
    setTripReplayFromTime("00:00");
    setTripReplayToDate(ymd);
    setTripReplayToTime("23:59");
    setTripReplayQuery("");
    setTripReplayTypeFilter("ALL");
    setTripReplayOpen(true);
    setTripReplayRunKey((k) => k + 1);
  }, []);

  const closeTripReplay = useCallback(() => {
    setTripReplayOpen(false);
    setTripReplayErr(null);
  }, []);

  const fmtKm = (m?: number | null) => {
    const n = typeof m === "number" && Number.isFinite(m) ? m : 0;
    const km = n / 1000;
    return `${km.toFixed(1)} km`;
  };

  const fmtHm = (sec?: number | null) => {
    const n =
      typeof sec === "number" && Number.isFinite(sec)
        ? Math.max(0, Math.floor(sec))
        : 0;
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    if (h <= 0) return `${m} min`;
    return `${h}h ${m}min`;
  };

  // ✅ fetch address via API server (cached) instead of direct Nominatim client
  const fetchStopAddress = useCallback(
    async (lat: number, lng: number) => {
      const k = coordKey(lat, lng);
      const cached = stopAddrByKey[k];
      const now = Date.now();
      if (cached && now - cached.fetchedAt < 6 * 60_000) return cached.name;
      if (inFlightAddrRef.current[k]) return cached?.name ?? "";
      inFlightAddrRef.current[k] = true;

      try {
        const res = await fetch(
          `/api/geocode/reverse?lat=${encodeURIComponent(
            String(lat),
          )}&lng=${encodeURIComponent(String(lng))}`,
          { cache: "no-store" },
        );
        const j = await res.json().catch(() => null);
        const name = String(j?.displayName ?? "").trim();

        if (name) {
          setStopAddrByKey((prev) => ({
            ...prev,
            [k]: { name, fetchedAt: Date.now() },
          }));
          return name;
        }
        return "";
      } catch {
        return "";
      } finally {
        inFlightAddrRef.current[k] = false;
      }
    },
    [stopAddrByKey],
  );

  const fetchDriverAddress = useCallback(
    async (sn: string, lat?: number | null, lng?: number | null) => {
      if (!sn || lat == null || lng == null) return "";
      const ck = coordKey(lat, lng);
      const cached = driverAddrBySn[sn];
      const now = Date.now();
      if (
        cached &&
        cached.coordKey === ck &&
        cached.name &&
        now - cached.fetchedAt < 6 * 60_000
      ) {
        return cached.name;
      }
      if (inFlightDriverAddrRef.current[sn]) return cached?.name ?? "";
      inFlightDriverAddrRef.current[sn] = true;

      try {
        const res = await fetch(
          `/api/geocode/reverse?lat=${encodeURIComponent(
            String(lat),
          )}&lng=${encodeURIComponent(String(lng))}`,
          { cache: "no-store" },
        );
        const j = await res.json().catch(() => null);
        const name = String(j?.displayName ?? "").trim();
        if (name) {
          setDriverAddrBySn((prev) => ({
            ...prev,
            [sn]: { name, coordKey: ck, fetchedAt: Date.now() },
          }));
          return name;
        }
        return "";
      } catch {
        return "";
      } finally {
        inFlightDriverAddrRef.current[sn] = false;
      }
    },
    [driverAddrBySn],
  );

  const isSelected = useCallback(
    (sn: string) => (selectedSn != null ? selectedSn === sn : false),
    [selectedSn],
  );

  const makeTruckIcon = (color: string) => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="18" fill="${color}" opacity="0.18"/>
  <rect x="7" y="16" width="18" height="8" rx="2" fill="${color}"/>
  <rect x="25" y="18" width="8" height="6" rx="1.5" fill="${color}"/>
  <rect x="27" y="16" width="4" height="2" rx="1" fill="#FFFFFF" opacity="0.8"/>
  <circle cx="13" cy="26" r="3" fill="#1F2937"/>
  <circle cx="28" cy="26" r="3" fill="#1F2937"/>
  <circle cx="13" cy="26" r="1.2" fill="#E5E7EB"/>
  <circle cx="28" cy="26" r="1.2" fill="#E5E7EB"/>
</svg>`;
    const iconUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    return (L as any).icon({
      iconUrl,
      iconSize: [40, 40],
      iconAnchor: [20, 28],
      popupAnchor: [0, -20],
      className: "truck-marker",
    });
  };

  const truckIconMoving = useMemo(() => makeTruckIcon("#16A34A"), []);
  const truckIconIdle = useMemo(() => makeTruckIcon("#DC2626"), []);

  const availableGroups = useMemo(() => {
    const s = new Set<string>();
    Object.values(CUSTOMER_BY_PLATE).forEach((c) => {
      const x = String(c ?? "").trim();
      if (x) s.add(x);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, []);

  // restore cache
  useEffect(() => {
    if (Array.isArray(driversProp)) return;
    try {
      const raw = window.sessionStorage.getItem(MAP_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.drivers)) {
        setDriversInternal(parsed.drivers);
        lastOkRef.current = parsed.drivers;
      }
      if (parsed?.paths && typeof parsed.paths === "object") {
        setPaths(parsed.paths);
      }
    } catch {}
  }, [driversProp]);

  // fetch trackers positions
  useEffect(() => {
    if (Array.isArray(driversProp)) return;

    let cancelled = false;

    const fetchPositions = async () => {
      try {
        const res = await fetch("/api/gps/trackers", { cache: "no-store" });
        if (!res.ok) return;

        const json = await res.json();
        const st = Number(json?.status);
        if (json?.status != null && st !== 200) return;

        const rows = Array.isArray(json?.data) ? json.data : [];
        if (!rows.length) return;

        const nowIso = new Date().toISOString();

        const mapped: DriverStatus[] = rows.map((r: any) => {
          const lat0 =
            toNum(r?.latitude) ?? toNum(r?.location?.latitude) ?? null;
          const lng0 =
            toNum(r?.longitude) ?? toNum(r?.location?.longitude) ?? null;

          const lat =
            typeof lat0 === "number" ? normalizeCoordClient(lat0) : null;
          const lng =
            typeof lng0 === "number" ? normalizeCoordClient(lng0) : null;

          const aliasRaw = typeof r?.alias === "string" ? r.alias : null;
          const plateClean = cleanPlate(aliasRaw) || null;

          const sn = typeof r?.sn === "string" ? r.sn : String(r?.id ?? "");
          const key = sn;

          const speedRaw =
            typeof r?.speed === "number" ? r.speed : (toNum(r?.speed) ?? 0);
          let speedKmh = Number.isFinite(speedRaw) ? Number(speedRaw) : 0;
          speedKmh = clamp(speedKmh, 0, 160);

          if (lat != null && lng != null) {
            const nowMs = Date.now();
            const last = lastTelemetryRef.current[key];
            if (last?.p && last?.tMs) {
              const dtSec = Math.max(1, (nowMs - last.tMs) / 1000);
              const distM = haversineMeters(last.p, { lat, lng });
              const impliedKmh = (distM / dtSec) * 3.6;

              if (impliedKmh < 10 && speedKmh > 60) {
                speedKmh = last.speedKmh ?? 0;
              }

              const prevKmh = last.speedKmh ?? speedKmh;
              if (Math.abs(speedKmh - prevKmh) > 50) {
                speedKmh = prevKmh * 0.7 + speedKmh * 0.3;
              }
            }

            lastTelemetryRef.current[key] = {
              p: { lat, lng },
              tMs: Date.now(),
              speedKmh,
            };
          }

          return {
            id: sn,
            driverId: sn,
            plate: plateClean,

            direction: "forward",
            origin: "PT Indonesia Koito",
            destination: getCustomerLabel(plateClean),
            etdTime: null,
            etaTime: null,

            lat,
            lng,
            heading:
              typeof r?.degree === "number"
                ? r.degree
                : (toNum(r?.degree) ?? null),
            speed: Math.round(speedKmh),

            updatedAt: nowIso,
            isFinished: false,

            driver: { name: plateClean ?? "-", phone: null },
          };
        });

        if (cancelled) return;

        if (mapped.length) lastOkRef.current = mapped;
        setDriversInternal(mapped.length ? mapped : lastOkRef.current);

        setPaths((prev) => {
          const next: PathsByDriver = { ...prev };
          (mapped.length ? mapped : lastOkRef.current).forEach((d) => {
            if (d.lat == null || d.lng == null) return;
            const key = d.driverId;

            const point = { lat: d.lat, lng: d.lng };
            const existing = next[key] ?? [];

            const lastTele = lastTelemetryRef.current[key];
            const nowMs = Date.now();
            const dtSec = lastTele?.tMs
              ? Math.max(1, (nowMs - lastTele.tMs) / 1000)
              : 15;

            const smoothed = appendPointSmooth(existing, point, dtSec);
            const trimmed = keepLastN(smoothed, 120);

            const deduped = dedupeTrailing(trimmed, 4);
            next[key] = thinPathByDistance(deduped, 25);
          });
          return next;
        });
      } catch (err) {
        console.error("fetchPositions error:", err);
      }
    };

    fetchPositions();
    const interval = window.setInterval(fetchPositions, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [driversProp]);

  // save cache
  useEffect(() => {
    if (Array.isArray(driversProp)) return;
    if (!drivers.length) return;
    try {
      window.sessionStorage.setItem(
        MAP_CACHE_KEY,
        JSON.stringify({ drivers, paths, savedAt: Date.now() }),
      );
    } catch {}
  }, [drivers, paths, driversProp]);

  const defaultCenter =
    visibleDrivers.length > 0 &&
    visibleDrivers[0].lat != null &&
    visibleDrivers[0].lng != null
      ? { lat: visibleDrivers[0].lat, lng: visibleDrivers[0].lng }
      : { lat: -6.2, lng: 106.8166 };

  const invalidate = () => {
    const map = leafletMapRef.current;
    if (!map) return;
    try {
      map.invalidateSize();
    } catch {}
  };

  useEffect(() => {
    const r1 = requestAnimationFrame(() => invalidate());
    const r2 = requestAnimationFrame(() =>
      requestAnimationFrame(() => invalidate()),
    );
    const t1 = window.setTimeout(() => invalidate(), 50);
    const t2 = window.setTimeout(() => invalidate(), 200);
    const t3 = window.setTimeout(() => invalidate(), 380);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  useEffect(() => {
    const t1 = window.setTimeout(() => invalidate(), 50);
    const t2 = window.setTimeout(() => invalidate(), 320);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const t = window.setTimeout(() => invalidate(), 0);
    return () => window.clearTimeout(t);
  }, [effectiveDestFilter]);

  useEffect(() => {
    if (!tripReplayOpen) return;
    if (tripReplayFromDate) setTripReplayDate(tripReplayFromDate);
  }, [tripReplayOpen, tripReplayFromDate]);

  // ✅ FETCH DAILY TIMELINE on demand (selectedSn changes)
  useEffect(() => {
    const sn = selectedSn;
    if (!sn) return;

    const todayYmd = ymdJakartaClient();
    const cacheKey = `${sn}::${todayYmd}`;

    if (inFlightHistoryRef.current[cacheKey]) return;
    inFlightHistoryRef.current[cacheKey] = true;

    let cancelled = false;

    const run = async () => {
      try {
        const cached = historyBySn[cacheKey];
        const now = Date.now();

        if (cached && now - cached.fetchedAt < 60_000) {
          const rawPts = cached.points
            .map((p) => ({ lat: p.lat, lng: p.lng }))
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

          if (rawPts.length >= 2) {
            const cleaned = thinPathByDistance(
              dedupeTrailing(cleanOutliers(rawPts, HISTORY_MAX_JUMP_M), 4),
              HISTORY_MIN_SPACING_M,
            );
            setMatchedHistoryPaths((prev) => ({ ...prev, [sn]: cleaned }));
            fitBoundsSafe(leafletMapRef.current, cleaned);
          }
          return;
        }

        // ✅ DAILY timeline (00:00 - 23:59 WIB)
        const res = await fetch(
          `/api/gps/timeline?sn=${encodeURIComponent(sn)}&date=${encodeURIComponent(
            todayYmd,
          )}&maxPoints=${HISTORY_MAX_DRAW_POINTS}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;

        const json = await res.json();

        const pts0: HistoryPoint[] = Array.isArray(json?.points)
          ? json.points
          : [];

        // ambil STOP dari timeline supaya sudah ada address & durationSec final
        const stops0: HistoryStop[] = Array.isArray(json?.timeline)
          ? json.timeline.filter((x: any) => x?.type === "STOP")
          : Array.isArray(json?.stops)
            ? json.stops
            : [];

        setHistoryBySn((prev) => ({
          ...prev,
          [cacheKey]: {
            points: pts0,
            stops: stops0,
            fetchedAt: Date.now(),
            date: todayYmd,
          },
        }));

        const rawPts: LatLng[] = pts0
          .map((p) => ({ lat: p.lat, lng: p.lng }))
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

        const cleaned = thinPathByDistance(
          dedupeTrailing(cleanOutliers(rawPts, HISTORY_MAX_JUMP_M), 4),
          HISTORY_MIN_SPACING_M,
        );

        if (cleaned.length >= 2) {
          setMatchedHistoryPaths((prev) => ({ ...prev, [sn]: cleaned }));
          fitBoundsSafe(leafletMapRef.current, cleaned);
        }
      } catch (e) {
        console.error("fetch timeline error:", e);
      } finally {
        inFlightHistoryRef.current[cacheKey] = false;
      }
    };

    run();

    return () => {
      cancelled = true;
      inFlightHistoryRef.current[cacheKey] = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSn]);

  // ✅ Prefetch address untuk stop (pakai name/address dari GPS dulu, kalau kosong baru reverse)
  useEffect(() => {
    if (!selectedSn) return;

    const todayYmd = ymdJakartaClient();
    const cacheKey = `${selectedSn}::${todayYmd}`;
    const hist = historyBySn[cacheKey];
    const stops = hist?.stops ?? [];
    if (!Array.isArray(stops) || stops.length === 0) return;

    const maxPrefetch = 30;

    (async () => {
      for (let i = 0; i < Math.min(stops.length, maxPrefetch); i++) {
        const s = stops[i] as any;
        if (!s) continue;
        const ck = coordKey(s.lat, s.lng);

        // kalau stop punya name/address dari GPS/timeline, simpan langsung
        const fromGps = getStopNameFromGps(s);
        if (fromGps) {
          if (!stopAddrByKey[ck]?.name) {
            setStopAddrByKey((prev) => ({
              ...prev,
              [ck]: { name: fromGps, fetchedAt: Date.now() },
            }));
          }
          continue;
        }

        // kalau belum ada, fetch reverse
        const cached = stopAddrByKey[ck]?.name ?? "";
        if (!cached) {
          await fetchStopAddress(s.lat, s.lng);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSn, historyBySn]);

  // ✅ Load trip replay data (by date)
  useEffect(() => {
    if (!tripReplayOpen || !tripReplaySn) return;

    let cancelled = false;
    const run = async () => {
      setTripReplayLoading(true);
      setTripReplayErr(null);
      try {
        const res = await fetch(
          `/api/gps/timeline?sn=${encodeURIComponent(tripReplaySn)}&date=${encodeURIComponent(tripReplayDate)}&maxPoints=${HISTORY_MAX_DRAW_POINTS}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (cancelled) return;
        if (!json?.ok) {
          setTripReplayData(null);
          setTripReplayErr(String(json?.error ?? "Gagal memuat trip replay"));
          return;
        }
        setTripReplayData(json);

        // also update map selection + path/stops cache for the chosen date
        setSelectedSn(tripReplaySn);
        const cacheKey = `${tripReplaySn}::${tripReplayDate}`;
        const pts0: HistoryPoint[] = Array.isArray(json?.points)
          ? json.points
          : [];
        const stops0: HistoryStop[] = Array.isArray(json?.timeline)
          ? json.timeline.filter((x: any) => x?.type === "STOP")
          : Array.isArray(json?.stops)
            ? json.stops
            : [];
        setHistoryBySn((prev) => ({
          ...prev,
          [cacheKey]: {
            points: pts0,
            stops: stops0,
            fetchedAt: Date.now(),
            date: tripReplayDate,
          },
        }));

        const rawPts: LatLng[] = pts0
          .map((p) => ({ lat: p.lat, lng: p.lng }))
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        const cleaned = thinPathByDistance(
          dedupeTrailing(cleanOutliers(rawPts, HISTORY_MAX_JUMP_M), 4),
          HISTORY_MIN_SPACING_M,
        );
        if (cleaned.length >= 2) {
          setMatchedHistoryPaths((prev) => ({
            ...prev,
            [tripReplaySn]: cleaned,
          }));
          fitBoundsSafe(leafletMapRef.current, cleaned);
        }
      } catch (e: any) {
        if (cancelled) return;
        setTripReplayData(null);
        setTripReplayErr(
          e?.message ? String(e.message) : "Gagal memuat trip replay",
        );
      } finally {
        if (!cancelled) setTripReplayLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripReplayOpen, tripReplaySn, tripReplayDate, tripReplayRunKey]);

  // ===== snappedPaths (DB history via OSRM) tetap =====
  const lastSnappedUpdatedAtRef = useRef<Record<string, string>>({});
  const inFlightSnapRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    const snapFromDbHistory = async (driverId: string) => {
      if (inFlightSnapRef.current[driverId]) return;
      inFlightSnapRef.current[driverId] = true;

      try {
        const hRes = await fetch(
          `/api/driver-status/history?driverId=${encodeURIComponent(
            driverId,
          )}&limit=80`,
          { method: "GET" },
        );

        const hJson = await hRes.json();
        const pointsFromDb: Array<{ lat: number; lng: number; t?: string }> =
          hJson?.ok && Array.isArray(hJson.points) ? hJson.points : [];

        if (pointsFromDb.length < 2) return;

        const mRes = await fetch("/api/osrm/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coords: pointsFromDb }),
        });

        const mJson = await mRes.json();
        if (cancelled) return;

        if (
          mJson?.ok &&
          Array.isArray(mJson.points) &&
          mJson.points.length >= 2
        ) {
          setSnappedPaths((prev) => ({
            ...prev,
            [driverId]: mJson.points as LatLng[],
          }));
        }
      } catch (err) {
        console.error("snapFromDbHistory error:", err);
      } finally {
        inFlightSnapRef.current[driverId] = false;
      }
    };

    drivers.forEach((d) => {
      const driverId = d.driverId;

      if (!d.etdTime) {
        setSnappedPaths((prev) => {
          if (!prev[driverId]?.length) return prev;
          const next = { ...prev };
          next[driverId] = [];
          return next;
        });
        lastSnappedUpdatedAtRef.current[driverId] = d.updatedAt;
        return;
      }

      if (d.lat == null || d.lng == null) return;

      const last = lastSnappedUpdatedAtRef.current[driverId];
      if (last === d.updatedAt) return;

      lastSnappedUpdatedAtRef.current[driverId] = d.updatedAt;
      snapFromDbHistory(driverId);
    });

    return () => {
      cancelled = true;
    };
  }, [drivers]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100vh-4.5rem)] bg-[#F6F8FB] overflow-hidden"
    >
      <MapContainerAny
        center={defaultCenter}
        zoom={13}
        className="w-full h-full rounded-2xl shadow-md border border-[#E5EBF3] overflow-hidden bg-white"
        whenCreated={(map: any) => {
          leafletMapRef.current = map;
          setTimeout(() => invalidate(), 0);
        }}
        zoomControl={false}
      >
        {mapStyle === "satellite" ? (
          <TileLayerAny
            key="satellite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
          />
        ) : (
          <TileLayerAny
            key="street"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
        )}

        {visibleDrivers.map((d) => {
          if (d.lat == null || d.lng == null) return null;

          const pos: LatLng = { lat: d.lat, lng: d.lng };
          const snKey = d.driverId;
          const selected = isSelected(snKey);

          const snapped = snappedPaths[snKey] ?? [];
          const matchedHistory = matchedHistoryPaths[snKey] ?? [];
          const raw = paths[snKey] ?? [];

          const pathToDraw = !selected
            ? []
            : snapped.length >= 2
              ? snapped
              : matchedHistory.length >= 2
                ? matchedHistory
                : raw.length >= 2
                  ? raw
                  : [];

          const plate = cleanPlate(d.plate) || "-";
          const customer = getCustomerLabel(plate);

          const labelDest =
            (d.direction ?? "forward") === "reverse"
              ? (d.origin ?? "PT Indonesia Koito")
              : (d.destination ?? "-");

          const dest = String(labelDest ?? "-").trim() || "-";
          const etd = String(d.etdTime ?? "-").trim() || "-";
          const eta = String(d.etaTime ?? "-").trim() || "-";

          const showDest = dest !== "-" && dest !== customer;
          const showEtdEta = etd !== "-" || eta !== "-";

          const isMoving = (d.speed ?? 0) > 3;
          const icon = isMoving ? truckIconMoving : truckIconIdle;

          // ambil stops dari cache harian (kalau sudah ada)
          // NOTE: kalau sedang Trip Replay untuk SN ini, pakai tanggal Trip Replay
          const activeYmd =
            tripReplayOpen && tripReplaySn === snKey
              ? tripReplayDate
              : ymdJakartaClient();
          const cacheKey = `${snKey}::${activeYmd}`;
          const hist = historyBySn[cacheKey];
          const rangeStartSec = parseJakartaLocalToSec(
            tripReplayFromDate,
            tripReplayFromTime,
          );
          const rangeEndSec = parseJakartaLocalToSec(
            tripReplayToDate,
            tripReplayToTime,
          );

          const tripReplayStops =
            tripReplayOpen && tripReplaySn === snKey
              ? pickTripReplayStops(tripReplayData).filter((s: any) => {
                  const startSec = getStopStartSec(s);
                  if (startSec == null) return false;
                  if (rangeStartSec != null && startSec < rangeStartSec) {
                    return false;
                  }
                  if (rangeEndSec != null && startSec > rangeEndSec) {
                    return false;
                  }
                  return true;
                })
              : [];

          const baseStops = selected && hist?.stops?.length ? hist.stops : [];

          const stops =
            tripReplayStops.length > 0 ? tripReplayStops : baseStops;

          const orderedStops = stops
            .slice()
            .sort(
              (a: any, b: any) =>
                (getStopStartSec(a) ?? 0) - (getStopStartSec(b) ?? 0),
            );

          return (
            <Fragment key={d.id}>
              {pathToDraw.length >= 2 && (
                <PolylineAny
                  positions={pathToDraw}
                  pathOptions={{
                    color: "#1D4ED8",
                    weight: 4,
                    opacity: 0.85,
                  }}
                />
              )}

              {/* Start/End markers for selected route */}
              {selected && pathToDraw.length >= 2 && (
                <>
                  <MarkerAny
                    position={pathToDraw[0] as any}
                    icon={makeStartIcon()}
                  >
                    <PopupAny>
                      <div className="min-w-[220px]">
                        <div className="text-sm font-extrabold text-slate-900">
                          {plate} • Start
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-600">
                          Koordinat:{" "}
                          <span className="text-slate-800">
                            {(pathToDraw[0] as any).lat.toFixed(5)},{" "}
                            {(pathToDraw[0] as any).lng.toFixed(5)}
                          </span>
                        </div>
                      </div>
                    </PopupAny>
                  </MarkerAny>

                  <MarkerAny
                    position={pathToDraw[pathToDraw.length - 1] as any}
                    icon={makeEndIcon()}
                  >
                    <PopupAny>
                      <div className="min-w-[220px]">
                        <div className="text-sm font-extrabold text-slate-900">
                          {plate} • End
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-600">
                          Koordinat:{" "}
                          <span className="text-slate-800">
                            {(
                              pathToDraw[pathToDraw.length - 1] as any
                            ).lat.toFixed(5)}
                            ,{" "}
                            {(
                              pathToDraw[pathToDraw.length - 1] as any
                            ).lng.toFixed(5)}
                          </span>
                        </div>
                      </div>
                    </PopupAny>
                  </MarkerAny>
                </>
              )}

              {orderedStops.map((s: any, idx: number) => {
                const k = `${snKey}-stop-${idx}`;
                const ck = coordKey(s.lat, s.lng);

                // alamat: prioritas dari data GPS/timeline (name/address), kalau kosong pakai cache reverse
                const addrFromGps = getStopNameFromGps(s);
                const addrCached = stopAddrByKey[ck]?.name ?? "";
                const addr = addrFromGps || addrCached || "";

                const durationSec = getStopDurationSec(s);
                const startSec = getStopStartSec(s);
                const endSec = getStopEndSec(s);

                return (
                  <Fragment key={k}>
                    <CircleMarkerAny
                      center={{ lat: s.lat, lng: s.lng }}
                      radius={4}
                      pathOptions={{
                        color: "#DC2626",
                        weight: 2,
                        fillColor: "#DC2626",
                        fillOpacity: 1,
                      }}
                    />

                    <MarkerAny
                      position={{ lat: s.lat, lng: s.lng }}
                      icon={makeStopNumberIcon(idx + 1)}
                      eventHandlers={{
                        click: async (e: any) => {
                          try {
                            e?.originalEvent?.stopPropagation?.();
                          } catch {}
                          setSelectedStopKey((prev) => (prev === k ? null : k));

                          // kalau belum ada addr dari gps/timeline dan cache kosong -> fetch reverse
                          if (!addrFromGps && !addrCached) {
                            await fetchStopAddress(s.lat, s.lng);
                          }
                        },
                      }}
                    >
                      <TooltipAny direction="top" offset={[0, -10]} opacity={1}>
                        <div className="px-1 py-0.5">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-extrabold text-red-600">
                              Stop #{idx + 1}
                            </span>
                            <span className="text-xs font-semibold text-slate-700">
                              {fmtDurationMinutesFromSec(durationSec)}
                            </span>
                          </div>

                          <div className="mt-1 text-[11px] font-semibold text-slate-600">
                            {addr || "(mencari alamat...)"}
                          </div>
                        </div>
                      </TooltipAny>

                      {selectedStopKey === k && (
                        <PopupAny>
                          <div className="min-w-[280px]">
                            <div className="text-base font-extrabold text-slate-900">
                              {plate}
                            </div>

                            <div className="mt-1 text-sm font-semibold text-slate-700">
                              Stopped:{" "}
                              <span className="text-red-600">
                                {fmtDurationMinutesFromSec(durationSec)}
                              </span>
                            </div>

                            <div className="mt-2 text-xs font-semibold text-slate-600">
                              Start:{" "}
                              <span className="text-slate-900">
                                {fmtDateTimeWib(startSec ?? s.startTime ?? s.t)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs font-semibold text-slate-600">
                              End:{" "}
                              <span className="text-slate-900">
                                {fmtDateTimeWib(endSec ?? s.endTime ?? null)}
                              </span>
                            </div>

                            <div className="mt-2 text-xs font-semibold text-slate-600">
                              Address:
                              <div className="mt-0.5 text-xs text-slate-900 break-words">
                                {addr || "(mencari alamat...)"}
                              </div>
                            </div>

                            <div className="mt-2 text-[11px] font-semibold text-slate-500">
                              Coord:{" "}
                              <span className="text-slate-700">
                                {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                              </span>
                            </div>
                          </div>
                        </PopupAny>
                      )}
                    </MarkerAny>
                  </Fragment>
                );
              })}

              <MarkerAny
                position={pos}
                icon={icon}
                eventHandlers={{
                  click: () => {
                    fetchDriverAddress(snKey, pos.lat, pos.lng);
                    toggleSelect(snKey);
                  },
                }}
              >
                <PopupAny>
                  <div className="min-w-[320px]">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-full bg-slate-200" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-base font-extrabold text-slate-900">
                            {plate}
                          </div>
                          <div
                            className={`text-[11px] font-extrabold ${isMoving ? "text-green-600" : "text-red-600"}`}
                          >
                            {isMoving ? "Moving" : "Stopped"}
                          </div>
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">
                          {isMoving ? "Moving" : "Stopped"}:{" "}
                          {Math.round(d.speed ?? 0)} km/h
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-600">
                          Updated at:{" "}
                          <span className="text-slate-900">
                            {fmtDateTimeWib(d.updatedAt)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-600">
                          Address:{" "}
                          <span className="text-slate-900">
                            {driverAddrBySn[snKey]?.coordKey ===
                            coordKey(pos.lat, pos.lng)
                              ? driverAddrBySn[snKey]?.name ||
                                "(mencari alamat...)"
                              : "(mencari alamat...)"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openTripReplay(snKey);
                        }}
                        className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-900 hover:bg-slate-50"
                        title="Trip replay"
                      >
                        Trip replay
                      </button>
                    </div>
                  </div>
                </PopupAny>
                <TooltipAny
                  direction="top"
                  offset={[0, -10]}
                  permanent
                  opacity={1}
                  interactive
                  className="!bg-white !text-slate-800 !border-slate-200 !rounded-xl !shadow-md"
                >
                  <style jsx global>{`
                    .leaflet-tooltip:before {
                      display: none !important;
                    }
                    .leaflet-tooltip {
                      padding: 8px 10px !important;
                      pointer-events: auto !important;
                    }
                  `}</style>

                  <div className="leading-tight">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleSelect(snKey);
                      }}
                      className="font-extrabold text-slate-900 text-left"
                      style={{ cursor: "pointer" }}
                      title={selected ? "Hide route" : "Show route"}
                    >
                      {plate}
                      {showDest && (
                        <>
                          {" "}
                          <span className="text-slate-400">•</span>{" "}
                          <span className="font-semibold">{dest}</span>
                        </>
                      )}
                    </button>

                    <div className="mt-0.5 text-[11px] font-semibold text-slate-600">
                      Customer:{" "}
                      <span className="text-slate-800">{customer}</span>
                    </div>

                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      Speed:{" "}
                      <span className="text-slate-700">
                        {Math.round(d.speed ?? 0)} km/h
                      </span>
                      {showEtdEta && (
                        <>
                          {" "}
                          • ETD: <span className="text-slate-700">{etd}</span> •
                          ETA: <span className="text-slate-700">{eta}</span>
                        </>
                      )}
                    </div>
                  </div>
                </TooltipAny>
              </MarkerAny>
            </Fragment>
          );
        })}
      </MapContainerAny>

      {/* FILTER CONTROL */}
      <div
        className="absolute top-5 left-5"
        style={{ zIndex: 99999, pointerEvents: "auto" }}
      >
        <div className="rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">
              Customer
            </span>
            <select
              value={effectiveDestFilter}
              onChange={(e) => setDestFilter(e.target.value)}
              className="text-xs font-semibold text-slate-900 outline-none bg-transparent"
            >
              <option value="ALL">All</option>
              {availableGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() =>
                setMapStyle((v) => (v === "street" ? "satellite" : "street"))
              }
              className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-800"
              title="Ganti mode peta"
            >
              {mapStyle === "satellite" ? "Satellite" : "Street"}
            </button>

            <span className="ml-2 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              {visibleDrivers.length} truck
            </span>
          </div>
        </div>
      </div>

      {tripReplayOpen && tripReplaySn && (
        <div
          className="absolute top-0 right-0 h-full w-full sm:w-[520px] bg-white border-l border-slate-200 shadow-2xl flex flex-col"
          style={{ zIndex: 999999, pointerEvents: "auto" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div className="text-sm font-extrabold text-slate-900">
              Trip Replay
            </div>
            <button
              type="button"
              onClick={closeTripReplay}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
            >
              ✕
            </button>
          </div>

          <div className="p-4 pb-6 flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 sm:pl-4">
                  <div className="w-20 text-sm font-semibold text-slate-700">
                    Tracker:
                  </div>
                  <select
                    value={tripReplaySn}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTripReplaySn(v);
                    }}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 bg-white"
                  >
                    {trackerOptions.map((o) => (
                      <option key={o.sn} value={o.sn}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    From:
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="date"
                      value={tripReplayFromDate}
                      onChange={(e) => {
                        setTripReplayFromDate(e.target.value);
                      }}
                      className="flex-1 rounded-xl border border-orange-400 px-3 py-2 text-sm font-semibold text-slate-900"
                    />
                    <input
                      type="time"
                      value={tripReplayFromTime}
                      onChange={(e) => setTripReplayFromTime(e.target.value)}
                      className="w-28 rounded-xl border border-orange-400 px-3 py-2 text-sm font-semibold text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    To:
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="date"
                      value={tripReplayToDate}
                      onChange={(e) => setTripReplayToDate(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                    />
                    <input
                      type="time"
                      value={tripReplayToTime}
                      onChange={(e) => setTripReplayToTime(e.target.value)}
                      className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setTripReplayRunKey((k) => k + 1)}
                  className="rounded-xl bg-orange-500 px-6 py-2 text-sm font-extrabold text-white shadow hover:bg-orange-600"
                  title="Show"
                >
                  Show
                </button>
              </div>
            </div>

            <div className="mt-4">
              {tripReplayLoading && (
                <div className="text-sm font-semibold text-slate-600">
                  Loading...
                </div>
              )}
              {tripReplayErr && (
                <div className="text-sm font-semibold text-red-600">
                  {tripReplayErr}
                </div>
              )}

              {!tripReplayLoading && !tripReplayErr && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTripReplayTypeFilter("DRIVE")}
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-semibold",
                          tripReplayTypeFilter === "DRIVE"
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        Traveled
                      </button>
                      <button
                        type="button"
                        onClick={() => setTripReplayTypeFilter("STOP")}
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-semibold",
                          tripReplayTypeFilter === "STOP"
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        Stop
                      </button>
                      <button
                        type="button"
                        onClick={() => setTripReplayTypeFilter("ALL")}
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-semibold",
                          tripReplayTypeFilter === "ALL"
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        All
                      </button>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <input
                        type="text"
                        value={tripReplayQuery}
                        onChange={(e) => setTripReplayQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setTripReplayQuery("")}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                      title="Reset pencarian"
                    >
                      Reset
                    </button>
                  </div>
                  {(() => {
                    const tl0: any[] = Array.isArray(tripReplayData?.timeline)
                      ? tripReplayData.timeline
                      : [];
                    const hasStop = tl0.some((x) => x?.type === "STOP");

                    const stops0: any[] = Array.isArray(tripReplayData?.stops)
                      ? tripReplayData.stops
                      : [];

                    const tlStops: any[] =
                      !hasStop && stops0.length
                        ? stops0.map((s: any, i: number) => {
                            const startSec = getStopStartSec(s);
                            const endSec = getStopEndSec(s);
                            const dur = getStopDurationSec(s);
                            const addr = getStopNameFromGps(s) || null;
                            return {
                              type: "STOP",
                              stopNo: Number(s?.stopNo ?? i + 1),
                              lat: s?.lat,
                              lng: s?.lng,
                              startSec: startSec,
                              endSec: endSec,
                              durationSec: dur,
                              startLabel: fmtTimeWibNoSec(startSec ?? null),
                              endLabel: fmtTimeWibNoSec(endSec ?? null),
                              address: addr,
                            };
                          })
                        : [];

                    const merged = [...tl0, ...tlStops]
                      .filter(
                        (x) => x && (x.type === "DRIVE" || x.type === "STOP"),
                      )
                      .sort(
                        (a, b) =>
                          Number(a?.startSec ?? 0) - Number(b?.startSec ?? 0),
                      );

                    const isToday =
                      String(tripReplayDate ?? "") === ymdJakartaClient();
                    const nowSec = Math.floor(Date.now() / 1000);

                    const normalized = merged.map((it, idx) => {
                      const startSec =
                        typeof it?.startSec === "number" ? it.startSec : null;
                      let endSec =
                        typeof it?.endSec === "number" ? it.endSec : null;
                      let durationSec =
                        typeof it?.durationSec === "number"
                          ? it.durationSec
                          : null;

                      const next = merged
                        .slice(idx + 1)
                        .find((x) => typeof x?.startSec === "number");
                      const nextStart =
                        typeof next?.startSec === "number"
                          ? next.startSec
                          : null;

                      if (startSec != null) {
                        if (nextStart != null && nextStart > startSec) {
                          endSec = nextStart;
                        } else if (
                          typeof (tripReplayData as any)?.endSec === "number"
                        ) {
                          const fallbackEnd = (tripReplayData as any).endSec;
                          if (fallbackEnd > startSec) endSec = fallbackEnd;
                        }

                        if (isToday && (endSec == null || endSec > nowSec)) {
                          endSec = nowSec;
                        }

                        if (endSec != null && endSec > startSec) {
                          durationSec = endSec - startSec;
                        }
                      }

                      const startLabel =
                        startSec != null
                          ? fmtTimeWibNoSec(startSec)
                          : it?.startLabel;
                      const endLabel =
                        endSec != null ? fmtTimeWibNoSec(endSec) : it?.endLabel;

                      return {
                        ...it,
                        endSec,
                        durationSec,
                        startLabel,
                        endLabel,
                      };
                    });

                    const deduped = normalized.reduce((acc: any[], it: any) => {
                      const prev = acc[acc.length - 1];
                      if (
                        prev &&
                        prev?.type === it?.type &&
                        prev?.startLabel &&
                        it?.startLabel &&
                        prev.startLabel === it.startLabel
                      ) {
                        return acc;
                      }
                      if (
                        prev &&
                        prev?.type === it?.type &&
                        prev?.startSec != null &&
                        it?.startSec != null
                      ) {
                        const diffSec = it.startSec - prev.startSec;
                        if (diffSec >= 0 && diffSec <= 60) {
                          return acc;
                        }
                      }
                      acc.push(it);
                      return acc;
                    }, []);

                    const totals = deduped.reduce(
                      (acc, it) => {
                        if (it?.type === "DRIVE") {
                          acc.totalDriveSec += Number(it?.durationSec ?? 0);
                          acc.totalDistanceMeters += Number(
                            it?.distanceMeters ?? 0,
                          );
                        } else if (it?.type === "STOP") {
                          acc.totalStopSec += Number(it?.durationSec ?? 0);
                        }
                        return acc;
                      },
                      {
                        totalDistanceMeters: 0,
                        totalDriveSec: 0,
                        totalStopSec: 0,
                      },
                    );

                    // expose to JSX below
                    if (tripReplayData) {
                      (tripReplayData as any).__renderTimeline = deduped;
                      (tripReplayData as any).__renderTotals = totals;
                    }
                    return null;
                  })()}
                  {(() => {
                    const timelineItems: any[] = Array.isArray(
                      (tripReplayData as any)?.__renderTimeline,
                    )
                      ? (tripReplayData as any).__renderTimeline
                      : [];
                    const q = tripReplayQuery.trim().toLowerCase();
                    const rangeStartSec = parseJakartaLocalToSec(
                      tripReplayFromDate,
                      tripReplayFromTime,
                    );
                    const rangeEndSec = parseJakartaLocalToSec(
                      tripReplayToDate,
                      tripReplayToTime,
                    );
                    const timeFiltered = timelineItems.filter((it: any) => {
                      const type = String(it?.type ?? "").toUpperCase();
                      if (
                        tripReplayTypeFilter !== "ALL" &&
                        type !== tripReplayTypeFilter
                      ) {
                        return false;
                      }

                      const startSec =
                        typeof it?.startSec === "number" ? it.startSec : null;
                      const endSec =
                        typeof it?.endSec === "number" ? it.endSec : startSec;

                      if (
                        rangeStartSec != null &&
                        rangeEndSec != null &&
                        startSec != null
                      ) {
                        if (rangeEndSec < rangeStartSec) return false;
                        const a = startSec;
                        const b = endSec ?? startSec;
                        if (b < rangeStartSec || a > rangeEndSec) return false;
                      }

                      return true;
                    });

                    const filtered = timeFiltered.filter((it: any) => {
                      if (!q) return true;
                      const hay = [
                        it?.type,
                        it?.address,
                        it?.stopNo,
                        it?.startLabel,
                        it?.endLabel,
                      ]
                        .map((v) => String(v ?? ""))
                        .join(" ")
                        .toLowerCase();
                      return hay.includes(q);
                    });

                    if (!timelineItems.length) {
                      return (
                        <div className="text-sm font-semibold text-slate-600">
                          Tidak ada data trip pada tanggal ini.
                        </div>
                      );
                    }

                    if (!filtered.length) {
                      return (
                        <div className="text-sm font-semibold text-slate-600">
                          Tidak ada hasil untuk pencarian ini.
                        </div>
                      );
                    }

                    const startLabel = String(
                      timeFiltered[0]?.startLabel ?? "-",
                    );
                    const endLabel = String(
                      timeFiltered[timeFiltered.length - 1]?.endLabel ?? "-",
                    );

                    return (
                      <>
                        {/* Timeline */}
                        <div className="rounded-2xl border border-slate-200 bg-white">
                          <div className="px-4 py-3 border-b border-slate-200">
                            <div className="text-sm font-extrabold text-slate-900">
                              Trip Timeline
                            </div>
                            <div className="mt-1 text-[11px] font-semibold text-slate-600">
                              Tracker:{" "}
                              <span className="text-slate-900">
                                {String(tripReplayData?.alias ?? tripReplaySn)}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] font-semibold text-slate-600">
                              Start:{" "}
                              <span className="text-slate-900">
                                {startLabel}
                              </span>{" "}
                              • End:{" "}
                              <span className="text-slate-900">{endLabel}</span>
                            </div>
                          </div>

                          <div className="p-4">
                            <div className="space-y-4">
                              {filtered.map((it: any, idx: number) => {
                                const isDrive = it?.type === "DRIVE";
                                const isStop = it?.type === "STOP";
                                if (!isDrive && !isStop) return null;
                                const stopIndex = isStop
                                  ? filtered
                                      .slice(0, idx + 1)
                                      .filter((x) => x?.type === "STOP").length
                                  : 0;

                                // left labels
                                const leftTitle = isDrive
                                  ? "Departed at"
                                  : "Stopped at";
                                const leftTime = String(
                                  (isDrive ? it?.startLabel : it?.startLabel) ??
                                    "-",
                                );
                                const leftDate = String(tripReplayDate ?? "-");

                                // visuals
                                const dotClass = isDrive
                                  ? "bg-green-500"
                                  : "bg-red-500";

                                const addr = String(it?.address ?? "").trim();

                                return (
                                  <div
                                    key={`tl-${idx}`}
                                    className="grid grid-cols-[140px_1fr] gap-3"
                                  >
                                    {/* Left rail */}
                                    <div className="relative">
                                      <div className="absolute left-[62px] top-0 bottom-0 w-px bg-slate-200" />

                                      <div className="flex items-start gap-3">
                                        <div className="w-[120px] text-right">
                                          <div className="text-[11px] font-semibold text-slate-600">
                                            {leftTitle}
                                          </div>
                                          <div className="text-sm font-extrabold text-slate-900">
                                            {leftTime}
                                          </div>
                                          <div className="text-[11px] font-semibold text-slate-600">
                                            {leftDate}
                                          </div>
                                        </div>

                                        <div className="relative z-10 flex items-center justify-center w-10">
                                          {isStop ? (
                                            <div className="h-8 w-8 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-extrabold">
                                              {stopIndex}
                                            </div>
                                          ) : (
                                            <div
                                              className={`h-8 w-8 rounded-full ${dotClass} border-4 border-white shadow`}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Right card */}
                                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                                      {isDrive ? (
                                        <>
                                          <div className="text-sm font-extrabold text-slate-900">
                                            Driving for:{" "}
                                            <span className="text-orange-600">
                                              {fmtHm(it?.durationSec)}
                                            </span>
                                          </div>
                                          <div className="mt-1 text-xs font-semibold text-slate-600">
                                            Traveled:{" "}
                                            <span className="text-slate-900">
                                              {fmtKm(it?.distanceMeters)}
                                            </span>
                                          </div>
                                          {/* ends-at removed */}
                                        </>
                                      ) : (
                                        <>
                                          <div className="text-sm font-extrabold text-slate-900">
                                            Stop for:{" "}
                                            <span className="text-orange-600">
                                              {fmtHm(it?.durationSec)}
                                            </span>
                                          </div>
                                          <div className="mt-1 text-xs font-semibold text-slate-600">
                                            Area:{" "}
                                            <span className="text-slate-900">
                                              {addr || "-"}
                                            </span>
                                          </div>
                                          {/* ends-at removed */}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Totals */}
                        {((tripReplayData as any)?.__renderTotals ||
                          tripReplayData?.totals) && (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            {(() => {
                              const t =
                                (tripReplayData as any)?.__renderTotals ??
                                tripReplayData.totals;
                              return (
                                <>
                                  <div className="text-xs font-semibold text-slate-600">
                                    Total Distance:{" "}
                                    <span className="text-orange-600 font-extrabold">
                                      {fmtKm(t.totalDistanceMeters)}
                                    </span>
                                  </div>
                                  <div className="mt-2 text-xs font-semibold text-slate-600">
                                    Total Stopped Time:{" "}
                                    <span className="text-orange-600 font-extrabold">
                                      {fmtHm(t.totalStopSec)}
                                    </span>
                                  </div>
                                  <div className="mt-2 text-xs font-semibold text-slate-600">
                                    Total Traveled Time:{" "}
                                    <span className="text-orange-600 font-extrabold">
                                      {fmtHm(t.totalDriveSec)}
                                    </span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

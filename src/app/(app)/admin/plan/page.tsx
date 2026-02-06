"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

type PlanRow = {
  destination: string;
  group: string; // ✅ DINAMIS: ngikutin excel
  tripNo?: number;
  tripCount?: number;

  // ✅ PLAN TIME (template): ETD/ETA di sini adalah TARGET dari Excel
  // ✅ ACTUAL ETA: nanti dihitung dari GPS (AccuGPS) saat truck sampai di customer
  etd: string;
  eta: string;
};

type PlanListResponse = {
  ok: boolean;
  plans?: PlanRow[];
  error?: string;
};

type UploadResponse =
  | { ok: true; count: number; dates?: string[] }
  | { ok: false; error?: string; errors?: string[] };

// ================================
// ✅ ACCUGPS REALTIME (untuk sinkron dengan RealtimeMap)
// ================================
type AccuGpsTracker = {
  sn?: string;
  id?: string | number;
  alias?: string | null; // biasanya plate
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
};

type AccuGpsTrackersResponse = {
  status?: number;
  message?: string;
  data?: AccuGpsTracker[];
};

type CustomerTargetPoint = { lat: number; lng: number; radiusM?: number };

// ✅ master customer label by plate (harus sama dengan RealtimeMap)
const CUSTOMER_BY_PLATE: Record<string, string> = {
  "T 9521 AB": "Yamaha Pulogadung Lokal",
  "T 9473 AB": "Yamaha Karawang",
  "T 8854 DH": "Yamaha Pulogadung export",
  "T 9508 AB": "Yamaha Karawang",
  "T 9472 AB": "Yamaha Pulogadung Lokal",
};

// ✅ per-plate target point (customer coordinates)
const PLATE_TARGET_POINTS: Record<string, CustomerTargetPoint> = {
  "T 8854 DH": { lat: -6.19122, lng: 106.92744, radiusM: 10000 },
  "T 9472 AB": { lat: -6.19172, lng: 106.92815, radiusM: 10000 },
  "T 9521 AB": { lat: -6.19123, lng: 106.92907, radiusM: 10000 },
  "T 9473 AB": { lat: -6.35097, lng: 107.28283, radiusM: 10000 },
  "T 9508 AB": { lat: -6.35048, lng: 107.27887, radiusM: 10000 },
};

const DEFAULT_ARRIVAL_RADIUS_M = 10000;

function normalizePlate(input?: string | null) {
  // normalisasi supaya mapping stabil (spasi, case)
  const s = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  return s;
}

function getCustomerLabel(plate?: string | null) {
  const key = normalizePlate(plate);
  return CUSTOMER_BY_PLATE[key] ?? "-";
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
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

function fmtKm(m?: number | null) {
  const n = typeof m === "number" && Number.isFinite(m) ? m : null;
  if (n == null) return "-";
  return `${(n / 1000).toFixed(2)} km`;
}

function Badge({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "blue" | "emerald" | "red" | "slate";
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-700"
        : tone === "slate"
          ? "border-slate-200 bg-slate-50 text-slate-700"
          : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

function fmtNowWIB() {
  return new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AdminPlanPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const PLAN_UPDATED_KEY = "plan-updated-at";

  const [loading, setLoading] = useState(true);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingRefresh, setLoadingRefresh] = useState(false);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [uploadErrs, setUploadErrs] = useState<string[]>([]);
  const [uploadOkMsg, setUploadOkMsg] = useState<string | null>(null);

  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [gpsLastRefreshed, setGpsLastRefreshed] = useState<string | null>(null);
  const [gpsTrackers, setGpsTrackers] = useState<AccuGpsTracker[]>([]);

  // ✅ otomatis: group counts dari data
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plans) {
      const g = String(p.group ?? "").trim() || "OTHER";
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [plans]);

  const gpsRows = useMemo(() => {
    const map = new Map<string, AccuGpsTracker>();
    for (const t of gpsTrackers) {
      const plate = normalizePlate(t.alias);
      if (!plate || plate === "-") continue;
      const curHasCoord =
        typeof t.latitude === "number" && typeof t.longitude === "number";
      const prev = map.get(plate);
      if (!prev) {
        map.set(plate, t);
        continue;
      }
      const prevHasCoord =
        typeof prev.latitude === "number" && typeof prev.longitude === "number";
      if (curHasCoord && !prevHasCoord) {
        map.set(plate, t);
      }
    }

    return Array.from(map.entries())
      .map(([plate, t]) => {
        const lat = typeof t.latitude === "number" ? t.latitude : null;
        const lng = typeof t.longitude === "number" ? t.longitude : null;
        const target = PLATE_TARGET_POINTS[plate] ?? null;
        const distM =
          target && lat != null && lng != null
            ? haversineMeters({ lat, lng }, target)
            : null;
        const radius =
          target?.radiusM ?? DEFAULT_ARRIVAL_RADIUS_M;
        const arrived =
          distM != null && Number.isFinite(radius) ? distM <= radius : false;

        return {
          plate,
          customer: getCustomerLabel(plate),
          lat,
          lng,
          target,
          distM,
          arrived,
        };
      })
      .sort((a, b) => a.plate.localeCompare(b.plate));
  }, [gpsTrackers]);

  const gpsCustomerCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of gpsRows) {
      const c = r.customer;
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [gpsRows]);

  const fetchPlan = async () => {
    try {
      setErr(null);
      const res = await fetch("/api/plan/list", { cache: "no-store" });
      const json: PlanListResponse = await res.json();

      if (!json?.ok) {
        setErr(json?.error ?? "Gagal memuat plan.");
        setPlans([]);
        return;
      }

      setPlans(Array.isArray(json.plans) ? json.plans : []);
      setLastRefreshed(fmtNowWIB());
    } catch {
      setErr("Gagal memuat plan (cek server/API).");
      setPlans([]);
    }
  };

  const fetchGpsTrackers = async () => {
    try {
      setGpsErr(null);
      setGpsLoading(true);

      // ✅ harus sama dengan RealtimeMap (server proxy handle token)
      const res = await fetch("/api/gps/trackers", { cache: "no-store" });
      if (!res.ok) {
        setGpsErr(`Gagal memuat GPS (HTTP ${res.status}).`);
        setGpsTrackers([]);
        return;
      }

      const json: AccuGpsTrackersResponse = await res.json();
      const rows = Array.isArray(json?.data) ? json.data : [];

      setGpsTrackers(rows);
      setGpsLastRefreshed(fmtNowWIB());
    } catch (e: any) {
      setGpsErr("Gagal memuat GPS (cek server/API). ");
      setGpsTrackers([]);
    } finally {
      setGpsLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchPlan();
      setLoading(false);

      // ✅ load GPS once at startup
      await fetchGpsTrackers();
    })();

    // ✅ poll GPS (hindari rate limit)
    const id = window.setInterval(fetchGpsTrackers, 15000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClickDownloadTemplate = () => {
    window.open("/api/plan/template", "_blank");
  };

  const onClickRefresh = async () => {
    setLoadingRefresh(true);
    setUploadOkMsg(null);
    setUploadErrs([]);
    await fetchPlan();
    setLoadingRefresh(false);
  };

  const onUpload = async () => {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setUploadOkMsg(null);
      setUploadErrs(["Pilih file .xlsx terlebih dahulu."]);
      return;
    }

    setLoadingUpload(true);
    setUploadOkMsg(null);
    setUploadErrs([]);
    setErr(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/plan/upload", {
        method: "POST",
        body: fd,
      });

      const json: UploadResponse = await res.json();

      if (!json?.ok) {
        const errs = Array.isArray((json as any)?.errors)
          ? ((json as any).errors as string[])
          : [];
        const single = (json as any)?.error
          ? [String((json as any).error)]
          : [];
        setUploadErrs(
          errs.length ? errs : single.length ? single : ["Upload gagal."],
        );
        return;
      }

      const dates = Array.isArray(json.dates) ? json.dates : [];
      const dateLabel = dates.length ? ` (Tanggal: ${dates.join(", ")})` : "";
      setUploadOkMsg(
        `Upload berhasil: ${json.count} row di-update.${dateLabel}`,
      );
      try {
        window.localStorage.setItem(PLAN_UPDATED_KEY, String(Date.now()));
      } catch {}
      await fetchPlan();

      if (input) input.value = "";
    } catch {
      setUploadErrs(["Upload gagal (cek server/API)."]);
    } finally {
      setLoadingUpload(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-slate-50">
      <div className="w-full px-3 md:px-4 lg:px-6 xl:px-8 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-extrabold tracking-tight text-slate-900">
              Plan Delivery
            </div>
            <div className="text-sm font-medium text-slate-600"></div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {lastRefreshed ? (
              <Badge tone="slate">Last refresh: {lastRefreshed}</Badge>
            ) : (
              <Badge tone="slate">Last refresh: -</Badge>
            )}
            <Badge>{plans.length} plan</Badge>

            {/* ✅ GPS status */}
            <Badge tone={gpsErr ? "red" : "emerald"}>
              GPS: {gpsErr ? "ERROR" : `${gpsRows.length} truck`}
            </Badge>
            {gpsLastRefreshed ? (
              <Badge tone="slate">GPS refresh: {gpsLastRefreshed}</Badge>
            ) : (
              <Badge tone="slate">GPS refresh: -</Badge>
            )}

            {/* ✅ otomatis: badge group ikut excel */}
            {groupCounts.map(([g, c]) => (
              <Badge key={g} tone="blue">
                {g}: {c}
              </Badge>
            ))}

            {/* ✅ otomatis: badge customer dari GPS */}
            {gpsCustomerCounts.map(([c, n]) => (
              <Badge key={c} tone="slate">
                {c}: {n}
              </Badge>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-extrabold text-slate-900">
                Upload Plan (Excel)
              </div>
              <div className="text-xs font-medium text-slate-600"></div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onClickDownloadTemplate}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Download Template
              </button>

              <button
                type="button"
                onClick={onClickRefresh}
                disabled={loadingRefresh}
                className={`rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50 ${
                  loadingRefresh
                    ? "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {loadingRefresh ? "Refreshing..." : "Refresh Plan"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="block w-full md:w-[360px] text-xs font-semibold text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-700 hover:file:bg-slate-50"
              />

              <button
                type="button"
                onClick={onUpload}
                disabled={loadingUpload}
                className={`rounded-xl border px-4 py-2 text-xs font-extrabold ${
                  loadingUpload
                    ? "border-blue-200 bg-blue-100 text-blue-400 cursor-not-allowed"
                    : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                {loadingUpload ? "Uploading..." : "Upload Excel"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {uploadOkMsg ? <Badge tone="emerald">{uploadOkMsg}</Badge> : null}
              {err ? <Badge tone="red">{err}</Badge> : null}
              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Buka Dashboard
              </Link>
            </div>
          </div>

          {uploadErrs.length > 0 && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="text-sm font-extrabold text-red-800">
                Validasi gagal
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-red-800">
                {uploadErrs.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
              <div className="mt-2 text-xs font-medium text-red-700">
                Perbaiki file Excel, lalu upload lagi.
              </div>
            </div>
          )}
        </div>

        {/* ✅ Realtime GPS (AccuGPS) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                Realtime Trucks (AccuGPS)
              </div>
              <div className="text-xs font-medium text-slate-600">
                Data ini harus sama dengan RealtimeMap. Plan akan dibandingkan
                dengan truck yang aktif di sini.
              </div>
            </div>

            <div className="flex items-center gap-2">
              {gpsLoading ? <Badge tone="slate">Loading...</Badge> : null}
              {gpsErr ? <Badge tone="red">{gpsErr}</Badge> : null}
              <button
                type="button"
                onClick={fetchGpsTrackers}
                disabled={gpsLoading}
                className={`rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50 ${
                  gpsLoading
                    ? "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {gpsLoading ? "Refreshing..." : "Refresh GPS"}
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-extrabold">
                    Police Number
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Customer
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">
                    Status (Target)
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">Last</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {gpsRows.map((r) => (
                  <tr key={r.plate} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {r.plate}
                    </td>
                    <td className="py-3 px-4">
                      <Badge tone="slate">{r.customer}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      {r.target ? (
                        r.arrived ? (
                          <Badge tone="emerald">ARRIVED</Badge>
                        ) : (
                          <Badge tone="blue">ON ROUTE</Badge>
                        )
                      ) : (
                        <Badge tone="slate">NO TARGET</Badge>
                      )}
                      <div className="mt-1 text-[11px] font-semibold text-slate-500">
                        Dist: {fmtKm(r.distM)} • R:{" "}
                        {r.target?.radiusM ?? DEFAULT_ARRIVAL_RADIUS_M}m
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-600">
                      {gpsLastRefreshed ?? "-"}
                    </td>
                  </tr>
                ))}

                {!gpsLoading && gpsRows.length === 0 && (
                  <tr>
                    <td className="py-5 px-4 text-slate-600" colSpan={4}>
                      Belum ada truck aktif dari GPS. Cek /api/gps/trackers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs font-medium text-slate-500">
            Catatan: ETD/ETA di Plan adalah target (template). Actual ETA akan
            dihitung saat truck sampai di customer (GPS).
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                Daftar Plan Aktif
              </div>
              <div className="text-xs font-medium text-slate-600"></div>
            </div>

            {loading ? <Badge tone="slate">Loading...</Badge> : null}
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-extrabold">
                    Destination
                  </th>
                  <th className="text-left py-3 px-4 font-extrabold">Group</th>
                  <th className="text-left py-3 px-4 font-extrabold">Trip</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {plans.map((p) => (
                  <tr
                    key={`${p.destination}__${typeof p.tripNo === "number" ? p.tripNo : 0}`}
                    className="hover:bg-slate-50"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {p.destination}
                    </td>
                    <td className="py-3 px-4">
                      <Badge tone="slate">{String(p.group ?? "-")}</Badge>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-700">
                      {typeof p.tripNo === "number" ? p.tripNo : "-"}
                    </td>
                  </tr>
                ))}

                {!loading && plans.length === 0 && (
                  <tr>
                    <td className="py-5 px-4 text-slate-600" colSpan={3}>
                      Belum ada plan di DB. Silakan upload Excel.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs font-medium text-slate-500"></div>
        </div>
      </div>
    </div>
  );
}

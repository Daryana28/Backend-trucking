// src/app/components/RealtimeMap.tsx

"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
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

  updatedAt: string;
  isFinished?: boolean | null;

  driver: {
    name: string;
    phone?: string | null;
  };
};

type LatLng = { lat: number; lng: number };
type PathsByDriver = Record<string, LatLng[]>;

type RealtimeMapProps = {
  sidebarOpen?: boolean;
};

type PlanRow = {
  destination: string;
  group: string;
};

const MapContainerAny = MapContainer as unknown as any;
const TileLayerAny = TileLayer as unknown as any;
const MarkerAny = Marker as unknown as any;
const TooltipAny = Tooltip as unknown as any;
const PolylineAny = Polyline as unknown as any;

// fallback group by prefix kalau plan belum ke-load
function fallbackGroupFromDest(dest?: string | null) {
  const s = (dest ?? "").trim().toUpperCase();
  if (s.startsWith("YIMM")) return "YIMM";
  if (s.startsWith("SIM")) return "SIM";
  return "OTHER";
}

export default function RealtimeMap({ sidebarOpen }: RealtimeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  const [drivers, setDrivers] = useState<DriverStatus[]>([]);
  const [paths, setPaths] = useState<PathsByDriver>({});

  const [snappedPaths, setSnappedPaths] = useState<PathsByDriver>({});

  // ✅ plan group map (dest -> group) untuk filter dinamis
  const [planGroups, setPlanGroups] = useState<Record<string, string>>({});

  // ✅ filter group dinamis (ALL + list group)
  const [destFilter, setDestFilter] = useState<string>("ALL");

  const truckIcon = useMemo(() => {
    return (L as any).icon({
      iconUrl: "/truck-marker.png",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
    });
  }, []);

  // ✅ fetch plan list untuk mapping group (AHM/YIMM/SIM/...)
  useEffect(() => {
    let cancelled = false;

    const fetchPlan = async () => {
      try {
        const res = await fetch("/api/plan/list", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const rows: PlanRow[] = Array.isArray(json?.plans) ? json.plans : [];
        if (!rows.length) return;

        const map: Record<string, string> = {};
        for (const r of rows) {
          if (!r?.destination) continue;
          map[r.destination] = String(r.group ?? "").trim();
        }

        if (!cancelled) setPlanGroups(map);
      } catch {}
    };

    fetchPlan();
    const id = window.setInterval(fetchPlan, 120000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const getGroup = (d: DriverStatus) => {
    // group berdasarkan destinasi forward (lebih konsisten)
    const dest =
      (d.direction ?? "forward") === "reverse"
        ? (d.origin ?? "").trim()
        : (d.destination ?? "").trim();

    const g = (planGroups[dest] ?? "").trim();
    return g || fallbackGroupFromDest(dest);
  };

  // ✅ list group dinamis untuk dropdown
  const availableGroups = useMemo(() => {
    const s = new Set<string>();
    Object.values(planGroups).forEach((g) => {
      const x = String(g ?? "").trim();
      if (x) s.add(x);
    });
    // tambah fallback umum biar tetap bisa pilih walau plan kosong
    if (s.size === 0) {
      s.add("YIMM");
      s.add("SIM");
      s.add("OTHER");
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [planGroups]);

  useEffect(() => {
    let cancelled = false;

    const fetchPositions = async () => {
      try {
        const res = await fetch("/api/driver-status/latest");
        if (!res.ok) return;
        const data: DriverStatus[] = await res.json();

        if (!cancelled) {
          setDrivers(Array.isArray(data) ? data : []);

          setPaths((prev) => {
            const next: PathsByDriver = { ...prev };

            (Array.isArray(data) ? data : []).forEach((d) => {
              if (d.lat == null || d.lng == null) return;

              const key = d.driverId;

              // kalau belum mulai / reset, kosongkan path
              if (!d.etdTime) {
                next[key] = [];
                return;
              }

              const point = { lat: d.lat, lng: d.lng };
              const existing = next[key] ?? [];
              const last = existing[existing.length - 1];

              if (!last || last.lat !== point.lat || last.lng !== point.lng) {
                next[key] = [...existing, point];
              }
            });

            return next;
          });
        }
      } catch (err) {
        console.error("fetchPositions error:", err);
      }
    };

    fetchPositions();
    const interval = setInterval(fetchPositions, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ✅ visible drivers: hide complete + apply group filter
  const visibleDrivers = useMemo(() => {
    const base = drivers.filter((d) => {
      if (d.lat == null || d.lng == null) return false;
      if (d.isFinished === true) return false; // ✅ COMPLETE => hide
      return true;
    });

    if (destFilter === "ALL") return base;

    return base.filter((d) => getGroup(d) === destFilter);
  }, [drivers, destFilter, planGroups]);

  const defaultCenter =
    visibleDrivers.length > 0 &&
    visibleDrivers[0].lat != null &&
    visibleDrivers[0].lng != null
      ? { lat: visibleDrivers[0].lat, lng: visibleDrivers[0].lng }
      : { lat: -6.2, lng: 106.8166 };

  const invalidate = () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.invalidateSize();
    } catch {}
  };

  useEffect(() => {
    const r1 = requestAnimationFrame(() => invalidate());
    const r2 = requestAnimationFrame(() =>
      requestAnimationFrame(() => invalidate())
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t1 = window.setTimeout(() => invalidate(), 50);
    const t2 = window.setTimeout(() => invalidate(), 320);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarOpen]);

  useEffect(() => {
    const t = window.setTimeout(() => invalidate(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destFilter]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => invalidate());
    ro.observe(el);

    const onWin = () => invalidate();
    window.addEventListener("resize", onWin);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomIn = () => {
    const map = mapRef.current;
    if (!map) return;
    map.zoomIn();
  };

  const zoomOut = () => {
    const map = mapRef.current;
    if (!map) return;
    map.zoomOut();
  };

  // ✅ snapping dari DB history (tetap)
  const lastSnappedUpdatedAtRef = useRef<Record<string, string>>({});
  const inFlightRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    const snapFromDbHistory = async (driverId: string) => {
      if (inFlightRef.current[driverId]) return;
      inFlightRef.current[driverId] = true;

      try {
        const hRes = await fetch(
          `/api/driver-status/history?driverId=${encodeURIComponent(
            driverId
          )}&limit=80`,
          { method: "GET" }
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
        inFlightRef.current[driverId] = false;
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
          mapRef.current = map;
          setTimeout(() => invalidate(), 0);
        }}
        zoomControl={false}
      >
        <TileLayerAny
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {visibleDrivers.map((d) => {
          if (d.lat == null || d.lng == null) return null;

          const pos: LatLng = { lat: d.lat, lng: d.lng };

          const snapped = snappedPaths[d.driverId] ?? [];
          const raw = paths[d.driverId] ?? [];
          const pathToDraw = snapped.length >= 2 ? snapped : raw;

          const plate = (d.plate ?? "-").trim() || "-";

          // label destinasi lebih jelas: forward gunakan destination, reverse gunakan origin
          const labelDest =
            (d.direction ?? "forward") === "reverse"
              ? d.origin ?? "PT Indonesia Koito"
              : d.destination ?? "-";

          const dest = (labelDest ?? "-").toString().trim() || "-";
          const etd = (d.etdTime ?? "-").trim() || "-";
          const eta = (d.etaTime ?? "-").trim() || "-";

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

              <MarkerAny position={pos} icon={truckIcon}>
                <TooltipAny
                  direction="top"
                  offset={[0, -10]}
                  permanent
                  opacity={1}
                  className="!bg-white !text-slate-800 !border-slate-200 !rounded-xl !shadow-md"
                >
                  <style jsx global>{`
                    .leaflet-tooltip:before {
                      display: none !important;
                    }
                    .leaflet-tooltip {
                      padding: 8px 10px !important;
                    }
                  `}</style>

                  <div className="leading-tight">
                    <div className="font-extrabold text-slate-900">
                      {plate} <span className="text-slate-400">•</span>{" "}
                      <span className="font-semibold">{dest}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      ETD: <span className="text-slate-700">{etd}</span> • ETA:{" "}
                      <span className="text-slate-700">{eta}</span>
                    </div>
                  </div>
                </TooltipAny>
              </MarkerAny>
            </Fragment>
          );
        })}
      </MapContainerAny>

      {/* FILTER CONTROL (dinamis) */}
      <div
        className="absolute top-5 left-5"
        style={{ zIndex: 99999, pointerEvents: "auto" }}
      >
        <div className="rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Filter</span>
            <select
              value={destFilter}
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

            <span className="ml-2 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              {visibleDrivers.length} driver
            </span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-50">
        <button
          onClick={zoomIn}
          className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-300 flex items-center justify-center text-2xl font-bold"
          type="button"
        >
          +
        </button>

        <button
          onClick={zoomOut}
          className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-300 flex items-center justify-center text-2xl font-bold"
          type="button"
        >
          –
        </button>
      </div>
    </div>
  );
}

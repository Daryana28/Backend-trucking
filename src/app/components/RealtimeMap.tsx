"use client";

import {
  GoogleMap,
  Marker,
  Polyline,
  useLoadScript,
} from "@react-google-maps/api";
import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";

type DriverStatus = {
  id: string;
  driverId: string;
  plate: string | null;
  destination: string | null;

  etdTime?: string | null; // ✅ supaya garis muncul setelah ETD

  lat: number | null;
  lng: number | null;
  heading: number | null;
  updatedAt: string;
  driver: {
    name: string;
    phone?: string | null;
  };
};

type PathsByDriver = Record<string, google.maps.LatLngLiteral[]>;

export default function RealtimeMap() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    libraries: ["geometry"],
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const [drivers, setDrivers] = useState<DriverStatus[]>([]);
  const [paths, setPaths] = useState<PathsByDriver>({});

  useEffect(() => {
    let cancelled = false;

    const fetchPositions = async () => {
      try {
        const res = await fetch("/api/driver-status/latest");
        if (!res.ok) return;
        const data: DriverStatus[] = await res.json();

        if (!cancelled) {
          setDrivers(data);

          setPaths((prev) => {
            const next: PathsByDriver = { ...prev };

            data.forEach((d) => {
              // ✅ null-check yang benar
              if (d.lat == null || d.lng == null) return;

              const key = d.driverId;

              // ✅ kalau belum ETD, jangan tampilkan garis (reset)
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

  if (!isLoaded) return <p>Loading map...</p>;

  const defaultCenter =
    drivers.length > 0 && drivers[0].lat != null && drivers[0].lng != null
      ? { lat: drivers[0].lat, lng: drivers[0].lng }
      : { lat: -6.2, lng: 106.8166 };

  const zoomIn = () => {
    const map = mapRef.current;
    if (!map) return;
    const currentZoom = map.getZoom() ?? 14;
    map.setZoom(currentZoom + 1);
  };

  const zoomOut = () => {
    const map = mapRef.current;
    if (!map) return;
    const currentZoom = map.getZoom() ?? 14;
    map.setZoom(currentZoom - 1);
  };

  return (
    <div className="relative w-full h-full min-h-screen">
      {/* ✅ WRAPPER tombol (minim perubahan): biar sejajar */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-3">
        {/* ✅ tombol history (baru) */}
        <button
          onClick={() => {
            window.location.href = "/history"; // ganti route kalau beda
          }}
          className="w-11 h-11 rounded-full bg-white shadow-xl border border-gray-300
                     flex items-center justify-center"
          aria-label="history"
          title="History"
        >
          <Image src="/history.png" width={22} height={22} alt="history" />
        </button>

        {/* tombol logout (kode kamu, nggak diubah logic-nya) */}
        <button
          onClick={() => {
            localStorage.removeItem("admin_token");
            window.location.href = "/login";
          }}
          className="w-11 h-11 rounded-full bg-white shadow-xl border border-gray-300
                     flex items-center justify-center"
          aria-label="logout"
          title="Logout"
        >
          <Image src="/logout.png" width={22} height={22} alt="logout" />
        </button>
      </div>

      <GoogleMap
        zoom={14}
        center={defaultCenter}
        onLoad={(map) => {
          mapRef.current = map;
        }}
        mapContainerClassName="w-full h-full"
        options={{
          disableDefaultUI: true,
          gestureHandling: "greedy",
        }}
      >
        {drivers.map((d) => {
          if (d.lat == null || d.lng == null) return null;

          const pos = { lat: d.lat, lng: d.lng };
          const path = paths[d.driverId] ?? [];

          const plate = d.plate ?? "-";
          const dest = d.destination ?? "-";

          return (
            <Fragment key={d.id}>
              {/* tampilkan rute kalau minimal 2 titik */}
              {path.length >= 2 && (
                <Polyline
                  path={path}
                  options={{
                    strokeOpacity: 0.9,
                    strokeWeight: 4,
                  }}
                />
              )}

              <Marker
                position={pos}
                label={{
                  text: `${plate} • ${dest}`,
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: "bold",
                }}
                icon={{
                  url: "/truck-marker.png",
                  scaledSize: new google.maps.Size(40, 40),
                  anchor: new google.maps.Point(20, 20),
                  labelOrigin: new google.maps.Point(20, -6),
                }}
              />
            </Fragment>
          );
        })}
      </GoogleMap>

      <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-50">
        <button
          onClick={zoomIn}
          className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-300
                     flex items-center justify-center text-2xl font-bold"
        >
          +
        </button>

        <button
          onClick={zoomOut}
          className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-300
                     flex items-center justify-center text-2xl font-bold"
        >
          –
        </button>
      </div>
    </div>
  );
}

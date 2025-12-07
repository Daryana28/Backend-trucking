// src/app/components/RealtimeMap.tsx
"use client";

import {
  GoogleMap,
  Marker,
  Polyline,
  useLoadScript,
} from "@react-google-maps/api";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type DriverStatus = {
  id: string;
  driverId: string;
  plate: string | null;
  destination: string | null;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  updatedAt: string;
  driver: {
    name: string;
    phone?: string | null;
  };
};

// path jejak per driver
type PathsByDriver = Record<string, google.maps.LatLngLiteral[]>;

export default function RealtimeMap() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    libraries: ["geometry"],
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const [drivers, setDrivers] = useState<DriverStatus[]>([]);
  const [paths, setPaths] = useState<PathsByDriver>({});

  // ambil posisi driver dari backend (polling)
  useEffect(() => {
    let cancelled = false;

    const fetchPositions = async () => {
      try {
        const res = await fetch("/api/driver-status/latest");
        if (!res.ok) return;
        const data: DriverStatus[] = await res.json();

        if (!cancelled) {
          setDrivers(data);

          // update jejak path per driver
          setPaths((prev) => {
            const next: PathsByDriver = { ...prev };

            data.forEach((d) => {
              if (!d.lat || !d.lng) return;

              const key = d.driverId;
              const point = { lat: d.lat, lng: d.lng };

              const existing = next[key] ?? [];
              const last = existing[existing.length - 1];

              // hindari duplikat titik yang sama persis
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

    fetchPositions(); // pertama kali
    const interval = setInterval(fetchPositions, 5000); // refresh tiap 5 detik

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!isLoaded) return <p>Loading map...</p>;

  // tentukan center map (pakai driver pertama yang punya lat/lng)
  const defaultCenter =
    drivers.length > 0 && drivers[0].lat && drivers[0].lng
      ? { lat: drivers[0].lat, lng: drivers[0].lng }
      : { lat: -6.2, lng: 106.8166 }; // fallback Jakarta

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
      {/* LOGOUT BUTTON */}
      <button
        onClick={() => {
          localStorage.removeItem("admin_token");
          window.location.href = "/login";
        }}
        className="absolute top-6 right-6 z-50 
             w-11 h-11 rounded-full bg-white shadow-xl border border-gray-300
             flex items-center justify-center"
      >
        <Image src="/logout.png" width={22} height={22} alt="logout" />
      </button>

      {/* GOOGLE MAP */}
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
        {/* marker + jalur semua driver */}
        {drivers.map((d) => {
          if (!d.lat || !d.lng) return null;

          const pos = { lat: d.lat, lng: d.lng };
          const path = paths[d.driverId] ?? [pos];

          // --- tambahan: text label (nopol + destinasi) ---
          const plate = d.plate ?? "-";
          const dest = d.destination ?? "-";

          return (
            <div key={d.id}>
              {/* garis rute (jejak perjalanan) */}
              <Polyline
                path={path}
                options={{
                  strokeOpacity: 0.9,
                  strokeWeight: 4,
                  // warna default (biar tidak set manual sesuai instruksi tools)
                }}
              />

              {/* marker truk + label */}
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
                  // posisi label di atas icon
                  labelOrigin: new google.maps.Point(20, -6),
                }}
              />
            </div>
          );
        })}
      </GoogleMap>

      {/* ZOOM BUTTONS */}
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

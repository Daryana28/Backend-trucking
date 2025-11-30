"use client";

import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import { useEffect, useState, useRef } from "react";
import LogoutButton from "./LogoutButton";
import Image from "next/image";

export default function RealtimeMap() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    libraries: ["geometry"],
  });

  const mapRef = useRef<any>(null);

  const [driverPos, setDriverPos] = useState({
    lat: -6.2,
    lng: 106.8166,
    heading: 0,
  });

  // STREAM POSISI DRIVER
  useEffect(() => {
    const stream = new EventSource("/api/status/stream");

    stream.onmessage = (e) => {
      if (!e.data || e.data === "ping") return;

      let d: any = null;
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }

      if (!d?.lat || !d?.lng) return;

      setDriverPos({
        lat: Number(d.lat),
        lng: Number(d.lng),
        heading: Number(d.heading) || 0,
      });
    };

    return () => stream.close();
  }, []);

  if (!isLoaded) return <p>Loading map...</p>;

  const zoomIn = () => {
    if (!mapRef.current) return;
    mapRef.current.setZoom(mapRef.current.getZoom() + 1);
  };

  const zoomOut = () => {
    if (!mapRef.current) return;
    mapRef.current.setZoom(mapRef.current.getZoom() - 1);
  };

  return (
    <div className="relative w-full h-full min-h-screen">
      {/* 🔥 LOGOUT BUTTON DI POJOK KANAN ATAS */}
      {/* === LOGOUT BUTTON (TOP RIGHT) === */}
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
        center={driverPos}
        onLoad={(map) => {
          mapRef.current = map as google.maps.Map;
        }}
        mapContainerClassName="w-full h-full"
        options={{
          disableDefaultUI: true,
          gestureHandling: "greedy",
        }}
      >
        <Marker position={driverPos} />
      </GoogleMap>

      {/* === ZOOM BUTTONS === */}
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

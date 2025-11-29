"use client";

import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import { useEffect, useState, useRef } from "react";

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

  // STREAM
  useEffect(() => {
    const stream = new EventSource("/api/locations/stream");

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

  // ZOOM HANDLERS
  const zoomIn = () => {
    if (!mapRef.current) return;
    const currentZoom = mapRef.current.getZoom();
    mapRef.current.setZoom(currentZoom + 1);
  };

  const zoomOut = () => {
    if (!mapRef.current) return;
    const currentZoom = mapRef.current.getZoom();
    mapRef.current.setZoom(currentZoom - 1);
  };

  return (
    <div className="relative w-full h-full min-h-screen">
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

      {/* === ZOOM BUTTONS (RIGHT BOTTOM) === */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-50">
        {/* Zoom In */}
        <button
          onClick={zoomIn}
          className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-300
                     flex items-center justify-center text-2xl font-bold"
        >
          +
        </button>

        {/* Zoom Out */}
        <button
          onClick={zoomOut}
          className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-0
                     flex items-center justify-center text-2xl font-bold"
        >
          –
        </button>
      </div>
    </div>
  );
}

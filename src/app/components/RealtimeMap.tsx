"use client";

import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import { useEffect, useState } from "react";

export default function RealtimeMap() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    libraries: ["geometry"],
  });

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

  return (
    <div className="relative w-full h-full">
      {/* LOGO */}
      <img
        src="/koito.png"
        alt="Logo"
        className="
          absolute top-0 left-8 z-50
          w-28 object-contain
        "
      />

      {/* GOOGLE MAP */}
      <GoogleMap
        zoom={14}
        center={driverPos}
        mapContainerStyle={{ width: "100%", height: "100%" }}
        options={{
          disableDefaultUI: true,
          scrollwheel: true,
          draggable: true,
          gestureHandling: "greedy",
        }}
      >
        <Marker position={driverPos} />
      </GoogleMap>
    </div>
  );
}

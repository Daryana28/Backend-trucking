"use client";

import { useEffect, useState } from "react";

type VehicleData = {
  driverId: string;
  plate?: string | null;
  destination?: string | null;
  etdTime?: string | null;
  etaTime?: string | null;
  direction?: string | null;
  updatedAt?: string;
  driver?: {
    name?: string | null;
    phone?: string | null;
  };
};

const tabs = ["Perangkat", "Riwayat"] as const;
type TabKey = (typeof tabs)[number];

function openWhatsApp(phone?: string | null) {
  if (!phone) return;
  let clean = phone.replace(/[^0-9+]/g, "");
  if (clean.startsWith("0")) clean = "62" + clean.slice(1);
  if (clean.startsWith("+")) clean = clean.slice(1);
  window.open(`https://wa.me/${clean}`, "_blank");
}

export default function BhisaSidebar() {
  const [open, setOpen] = useState(true);

  const [latest, setLatest] = useState<VehicleData[]>([]);
  const [history, setHistory] = useState<VehicleData[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("Perangkat");

  useEffect(() => {
    const stream = new EventSource("/api/status/stream");

    stream.onmessage = (e) => {
      if (!e.data || e.data === "ping") return;

      let payload: { active: VehicleData[]; history: VehicleData[] };
      try {
        payload = JSON.parse(e.data);
      } catch {
        return;
      }

      const { active, history: historyData } = payload;
      setLatest(active);

      setHistory((prev) => {
        const next = [...prev];
        historyData.forEach((item) => {
          const key = `${item.driverId}-${item.updatedAt}`;
          if (!next.some((h) => `${h.driverId}-${h.updatedAt}` === key)) {
            next.unshift(item);
          }
        });
        return next.slice(0, 200);
      });
    };

    return () => stream.close();
  }, []);

  const filteredLatest = latest.filter((v) =>
    v.destination?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredHistory = history.filter((v) =>
    v.destination?.toLowerCase().includes(search.toLowerCase())
  );

  const listToRender =
    activeTab === "Perangkat" ? filteredLatest : filteredHistory;

  return (
    <div className="fixed z-50 top-4 left-4 w-fit">
      {/* Toggle Button */}
      <button
        onClick={() => setOpen(!open)}
        className="h-11 w-11 rounded-full bg-white shadow-xl border border-gray-300
          flex items-center justify-center transition-all duration-300"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke="#333"
          strokeWidth="2"
          fill="none"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar Panel */}
      <div
        className={`
          mt-3 bg-white rounded-2xl shadow-xl border border-gray-200
          overflow-y-auto
          transition-all duration-300 ease-out
          ${open ? "opacity-100" : "opacity-0 pointer-events-none"}
          ${open ? "max-h-[80vh]" : "max-h-0"}
          w-[90vw] lg:w-[360px]
        `}
      >
        {open && (
          <div className="flex flex-col h-full">
            {/* =============================== */}
            {/*           STICKY TABS           */}
            {/* =============================== */}
            <div className="flex border-b border-gray-200 flex-shrink-0 sticky top-0 z-20 bg-white">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`flex-1 text-sm font-medium py-3 border-b-2
                    ${
                      activeTab === t
                        ? "text-gray-900 border-blue-500"
                        : "text-gray-500 border-transparent"
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* =============================== */}
            {/*       STICKY SEARCH BAR         */}
            {/* =============================== */}
            <div className="p-3 flex-shrink-0 sticky top-[48px] z-20 bg-white">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#666"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>

                <input
                  placeholder="Cari kendaraan…"
                  className="bg-transparent outline-none text-gray-600 w-full"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* LIST (scrollable) */}
            <div className="flex-1 overflow-auto px-3 pb-3 space-y-3">
              {listToRender.map((v, idx) => (
                <VehicleItem
                  key={`${v.driverId}-${v.updatedAt ?? idx}`}
                  plate={v.plate}
                  driverName={v.driver?.name}
                  driverPhone={v.driver?.phone}
                  destination={v.destination}
                  etd={v.etdTime}
                  eta={v.etaTime}
                  direction={v.direction}
                  isComplete={Boolean(v.etaTime)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* VEHICLE ITEM */
function VehicleItem({
  plate,
  driverName,
  driverPhone,
  destination,
  etd,
  eta,
  direction,
  isComplete,
}: any) {
  const isForward = direction === "forward";
  const isReverse = direction === "reverse";

  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-3 border border-gray-200 shadow-sm">
      <div>
        <div className="text-sm font-semibold text-gray-900">
          {plate || "Unknown Plate"}
        </div>

        <div className="text-[11px] text-gray-700">
          {driverName || "Nama driver tidak tersedia"}
        </div>

        {driverPhone && (
          <button
            onClick={() => openWhatsApp(driverPhone)}
            className="text-[11px] text-green-600 underline"
          >
            {driverPhone}
          </button>
        )}

        <div className="text-[11px] text-gray-500">
          {destination || "Destinasi belum dipilih"}
        </div>

        <div className="text-[11px] text-gray-500">
          ETD: {etd || "-"} | ETA: {eta || "-"}
        </div>

        <div
          className={`text-[11px] mt-1 ${
            isComplete ? "text-green-600" : "text-red-500"
          }`}
        >
          {isComplete ? "Delivery Complete" : "Delivery Process"}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <span
          className={`text-xl ${
            isForward
              ? "text-orange-500"
              : isReverse
              ? "text-slate-500"
              : "text-gray-400"
          }`}
        >
          {isReverse ? "🚚←" : "🚚→"}
        </span>

        <div
          className={`h-3 w-3 rounded-full ${
            isComplete ? "bg-green-500" : "bg-red-500"
          }`}
        />
      </div>
    </div>
  );
}

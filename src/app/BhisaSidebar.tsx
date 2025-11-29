"use client";

import { useEffect, useState } from "react";

type TripItem = {
  tripGroup: string;
  driverId: string;
  driver?: {
    name?: string | null;
    phone?: string | null;
  } | null;
  plate?: string | null;
  origin?: string | null;
  destinationForward?: string | null;
  destinationReverse?: string | null;
  forward?: {
    etdTime?: string | null;
    etaTime?: string | null;
    direction?: string | null;
  } | null;
  reverse?: {
    etdTime?: string | null;
    etaTime?: string | null;
    direction?: string | null;
  } | null;
  isComplete: boolean;
  lastUpdated: string;
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
  const [active, setActive] = useState<TripItem[]>([]);
  const [history, setHistory] = useState<TripItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("Perangkat");

  useEffect(() => {
    const ev = new EventSource("/api/status/stream");

    ev.onmessage = (e) => {
      if (!e.data || e.data === "ping") return;

      try {
        const payload = JSON.parse(e.data) as {
          active: TripItem[];
          history: TripItem[];
        };

        setActive(payload.active || []);
        setHistory(payload.history || []);
      } catch {
        // ignore parse error
      }
    };

    ev.onerror = () => {
      // optional: handle error reconnect
    };

    return () => ev.close();
  }, []);

  const listSource = activeTab === "Perangkat" ? active : history;

  const filtered = listSource.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.plate?.toLowerCase().includes(q) ||
      item.driver?.name?.toLowerCase().includes(q) ||
      item.origin?.toLowerCase().includes(q) ||
      item.destinationForward?.toLowerCase().includes(q) ||
      item.destinationReverse?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed z-50 top-4 left-4 w-fit">
      {/* Toggle Button */}
      <button
        onClick={() => setOpen((v) => !v)}
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

      {/* Panel */}
      <div
        className={`
          mt-3 bg-white rounded-2xl shadow-xl border border-gray-200
          overflow-y-auto
          transition-all duration-300 ease-out
          ${open ? "opacity-100" : "opacity-0 pointer-events-none"}
          ${open ? "max-h-[80vh]" : "max-h-0"}
          w-[90vw] lg:w-[380px]
        `}
      >
        {open && (
          <div className="flex flex-col h-full">
            {/* TABS */}
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

            {/* SEARCH */}
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
                  placeholder="Cari nopol / driver / tujuan…"
                  className="bg-transparent outline-none text-gray-600 w-full text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* LIST */}
            <div className="flex-1 overflow-auto px-3 pb-3 space-y-3">
              {filtered.map((item) => (
                <TripCard key={item.tripGroup} item={item} />
              ))}

              {filtered.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-4">
                  Tidak ada data
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ CARD GROUPING ============ */

function TripCard({ item }: { item: TripItem }) {
  const { driver, plate, origin, destinationForward, destinationReverse } =
    item;
  const f = item.forward;
  const r = item.reverse;

  const statusText = item.isComplete ? "Delivery Complete" : "Delivery Process";
  const statusColor = item.isComplete
    ? "bg-green-100 text-green-700"
    : "bg-amber-100 text-amber-700";
  const dotColor = item.isComplete ? "bg-green-500" : "bg-amber-500";

  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-200 shadow-sm p-3 space-y-3">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {plate || "Unknown Plate"}
          </div>
          <div className="text-[11px] text-gray-600">
            {driver?.name || "Nama driver tidak tersedia"}
          </div>

          {driver?.phone && (
            <button
              onClick={() => openWhatsApp(driver.phone)}
              className="text-[11px] text-green-600 underline"
            >
              {driver.phone}
            </button>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}
          >
            {statusText}
          </span>
          <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
        </div>
      </div>

      {/* BODY */}
      <div className="grid grid-cols-1 gap-2 border-t border-gray-200 pt-2">
        {/* FORWARD */}
        <div className="rounded-xl bg-white/80 border border-orange-100 px-2.5 py-2">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-semibold text-orange-600 flex items-center gap-1">
              <span>Forward</span>
              <span>🚚→</span>
            </span>
            <span className="text-gray-400">
              ETD: {f?.etdTime || "-"} · ETA: {f?.etaTime || "-"}
            </span>
          </div>

          <div className="text-[11px] text-gray-600">
            <div>
              <span className="font-medium">From: </span>
              <span>{origin || "-"}</span>
            </div>
            <div>
              <span className="font-medium">To: </span>
              <span>{destinationForward || "-"}</span>
            </div>
          </div>
        </div>

        {/* REVERSE */}
        <div className="rounded-xl bg-white/80 border border-slate-100 px-2.5 py-2">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-semibold text-slate-600 flex items-center gap-1">
              <span>Reverse</span>
              <span>🚚←</span>
            </span>
            <span className="text-gray-400">
              ETD: {r?.etdTime || "-"} · ETA: {r?.etaTime || "-"}
            </span>
          </div>

          <div className="text-[11px] text-gray-600">
            <div>
              <span className="font-medium">From: </span>
              <span>{destinationForward || "-"}</span>
            </div>
            <div>
              <span className="font-medium">To: </span>
              <span>{destinationReverse || "-"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

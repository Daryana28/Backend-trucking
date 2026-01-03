"use client";

import { useEffect, useMemo, useState } from "react";

type HistoryItem = {
  tripGroup: string;
  driverId: string;
  driverName: string | null;
  driverPhone: string | null;
  plate: string | null;

  originForward: string | null;
  destinationForward: string | null;
  etdForward: string | null;
  etaForward: string | null;

  originReverse: string | null;
  destinationReverse: string | null;
  etdReverse: string | null;
  etaReverse: string | null;

  isComplete: boolean;
  lastUpdated: string;
};

export default function HistoryPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);

  // filters
  const [q, setQ] = useState("");
  const [plate, setPlate] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [complete, setComplete] = useState<"all" | "true" | "false">("all");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (plate.trim()) p.set("plate", plate.trim());
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    p.set("complete", complete);
    return p.toString();
  }, [q, plate, dateFrom, dateTo, complete]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErr(null);

      try {
        const res = await fetch(`/api/history/report?${qs}`, {
          cache: "no-store",
        });
        const json = await res.json();
        const data: HistoryItem[] = Array.isArray(json)
          ? json
          : json?.data ?? [];
        if (!cancelled) setItems(data);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Gagal load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [qs]);

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      {/* ====== PAGE WRAPPER (mirip gambar) ====== */}
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* ====== HEADER CARD ====== */}
        <div className="bg-white rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => (window.location.href = "/home")}
                className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 text-slate-900 text-sm font-semibold"
              >
                ← Kembali ke Map
              </button>

              <div>
                <div className="text-2xl font-extrabold text-slate-900 leading-tight">
                  History
                </div>
                <div className="text-sm text-slate-500 font-medium">
                  Report perjalanan (Forward / Reverse)
                </div>
              </div>
            </div>

            <div className="text-sm font-semibold text-slate-600">
              {loading ? "Loading..." : `${items.length} data`}
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* ====== FILTER CARD (mirip gambar: 2 baris rapi) ====== */}
          <div className="px-6 py-5">
            <div className="bg-[#f6f7fb] rounded-3xl border border-gray-100 p-4">
              {/* baris 1 */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-5">
                  <input
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Cari (nopol/driver/tujuan)..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>

                <div className="lg:col-span-3">
                  <input
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Filter nopol..."
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                  />
                </div>

                <div className="lg:col-span-4">
                  <select
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                    value={complete}
                    onChange={(e) => setComplete(e.target.value as any)}
                  >
                    <option value="all">Semua</option>
                    <option value="true">Complete</option>
                    <option value="false">Active</option>
                  </select>
                </div>
              </div>

              {/* baris 2 */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mt-3">
                <div className="lg:col-span-6">
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    title="Dari tanggal"
                  />
                </div>

                <div className="lg:col-span-6">
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    title="Sampai tanggal"
                  />
                </div>
              </div>

              {err && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm font-semibold">
                  {err}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ====== TABLE CARD ====== */}
        <div className="mt-6 bg-white rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="text-base font-extrabold text-slate-900">
              Riwayat Perjalanan
            </div>
            <div className="text-sm font-semibold text-slate-500">
              {loading ? "Memuat..." : ""}
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          <div className="overflow-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-[#eef2ff] text-slate-700">
                <tr>
                  <th className="text-left px-6 py-4 font-extrabold">
                    Last Update
                  </th>
                  <th className="text-left px-6 py-4 font-extrabold">Nopol</th>
                  <th className="text-left px-6 py-4 font-extrabold">Driver</th>
                  <th className="text-left px-6 py-4 font-extrabold">
                    Forward
                  </th>
                  <th className="text-left px-6 py-4 font-extrabold">
                    Reverse
                  </th>
                  <th className="text-left px-6 py-4 font-extrabold">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {items.map((it) => (
                  <tr
                    key={it.tripGroup}
                    className="align-top hover:bg-slate-50"
                  >
                    <td className="px-6 py-5 whitespace-nowrap text-slate-700 font-semibold">
                      {new Date(it.lastUpdated).toLocaleString()}
                    </td>

                    <td className="px-6 py-5 font-extrabold text-slate-900 whitespace-nowrap">
                      {it.plate ?? "-"}
                    </td>

                    <td className="px-6 py-5">
                      <div className="font-extrabold text-slate-900">
                        {it.driverName ?? "-"}
                      </div>
                      <div className="text-blue-700 font-bold">
                        {it.driverPhone ?? ""}
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="font-bold text-slate-900 break-words">
                        From: {it.originForward ?? "-"}
                      </div>
                      <div className="font-bold text-slate-900 break-words">
                        To: {it.destinationForward ?? "-"}
                      </div>
                      <div className="text-xs font-extrabold text-slate-500 mt-2">
                        ETD: {it.etdForward ?? "-"} · ETA:{" "}
                        {it.etaForward ?? "-"}
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="font-bold text-slate-900 break-words">
                        From: {it.originReverse ?? "-"}
                      </div>
                      <div className="font-bold text-slate-900 break-words">
                        To: {it.destinationReverse ?? "-"}
                      </div>
                      <div className="text-xs font-extrabold text-slate-500 mt-2">
                        ETD: {it.etdReverse ?? "-"} · ETA:{" "}
                        {it.etaReverse ?? "-"}
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <span
                        className={
                          "inline-flex items-center px-4 py-2 rounded-full text-xs font-extrabold " +
                          (it.isComplete
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800")
                        }
                      >
                        {it.isComplete ? "Delivery Complete" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}

                {!loading && !err && items.length === 0 && (
                  <tr>
                    <td
                      className="px-6 py-14 text-center text-slate-600 font-semibold"
                      colSpan={6}
                    >
                      Belum ada history.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="h-6 bg-white" />
        </div>
      </div>
    </div>
  );
}

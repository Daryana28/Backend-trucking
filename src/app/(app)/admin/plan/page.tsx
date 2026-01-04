"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type PlanRow = {
  destination: string;
  group: "YIMM" | "SIM";
  etd: string;
  eta: string;
};

type PlanListResponse = {
  ok: boolean;
  plans?: PlanRow[];
  error?: string;
};

type UploadResponse =
  | { ok: true; count: number }
  | { ok: false; error?: string; errors?: string[] };

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

  const [loading, setLoading] = useState(true);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingRefresh, setLoadingRefresh] = useState(false);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [uploadErrs, setUploadErrs] = useState<string[]>([]);
  const [uploadOkMsg, setUploadOkMsg] = useState<string | null>(null);

  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const countYimm = useMemo(
    () => plans.filter((p) => p.group === "YIMM").length,
    [plans]
  );
  const countSim = useMemo(
    () => plans.filter((p) => p.group === "SIM").length,
    [plans]
  );

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchPlan();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClickDownloadTemplate = () => {
    // Simple: buka url template -> browser download
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
          errs.length ? errs : single.length ? single : ["Upload gagal."]
        );
        return;
      }

      setUploadOkMsg(`Upload berhasil: ${json.count} row di-update.`);
      // refresh daftar plan setelah upload
      await fetchPlan();

      // reset input supaya bisa upload file yang sama lagi
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
            <div className="text-sm font-medium text-slate-600">
              {/* Kelola Plan destinasi (destination, group, ETD, ETA) via Excel. */}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lastRefreshed ? (
              <Badge tone="slate">Last refresh: {lastRefreshed}</Badge>
            ) : (
              <Badge tone="slate">Last refresh: -</Badge>
            )}
            <Badge>{plans.length} plan</Badge>
            <Badge tone="blue">YIMM: {countYimm}</Badge>
            <Badge tone="blue">SIM: {countSim}</Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-extrabold text-slate-900">
                Upload Plan (Excel)
              </div>
              <div className="text-xs font-medium text-slate-600">
                Format sheet: <span className="font-semibold">PLAN</span> dengan
                kolom:{" "}
                <span className="font-semibold">
                  destination, group, etd, eta
                </span>
                .
              </div>
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
            </div>
          </div>

          {/* Upload errors */}
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

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-slate-900">
                Daftar Plan Aktif
              </div>
              <div className="text-xs font-medium text-slate-600">
                {/* Ini plan yang dipakai dashboard (jika DB ada isi). */}
              </div>
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
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {plans.map((p) => (
                  <tr key={p.destination} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {p.destination}
                    </td>
                    <td className="py-3 px-4">
                      <Badge tone={p.group === "YIMM" ? "blue" : "slate"}>
                        {p.group}
                      </Badge>
                    </td>
                  </tr>
                ))}

                {!loading && plans.length === 0 && (
                  <tr>
                    <td className="py-5 px-4 text-slate-600" colSpan={2}>
                      Belum ada plan di DB. Silakan upload Excel.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs font-medium text-slate-500">
            {/* Tips: setelah upload, dashboard otomatis pakai plan dari DB
            (fallback ke hardcode kalau DB kosong). */}
          </div>
        </div>
      </div>
    </div>
  );
}

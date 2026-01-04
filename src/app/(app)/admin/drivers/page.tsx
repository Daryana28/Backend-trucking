"use client";

import React, { useEffect, useState } from "react";

type DriverRow = { id: string; name: string; phone: string };

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr(null);
    const res = await fetch("/api/admin/drivers", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Gagal memuat driver");
      return;
    }

    setDrivers(Array.isArray(json?.drivers) ? json.drivers : []);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    setMsg(null);
    setErr(null);

    if (!name.trim() || !phone.trim() || !password.trim()) {
      setErr("Name, phone, password wajib diisi");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          password: password,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(json?.error ?? "Gagal membuat driver");
        return;
      }

      setMsg("Driver berhasil dibuat ✅");
      setName("");
      setPhone("");
      setPassword("");
      await load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-slate-50">
      <div className="w-full px-3 md:px-4 lg:px-6 xl:px-8 py-6 space-y-5">
        <div>
          <div className="text-xl font-extrabold tracking-tight text-slate-900">
            Driver Accounts
          </div>
          <div className="text-sm font-medium text-slate-600">
            {/* Buat akun driver untuk login mobile (password otomatis di-hash
            bcrypt). */}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-extrabold text-slate-900">
            Tambah Driver
          </div>

          {err ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">
              {err}
            </div>
          ) : null}

          {msg ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              {msg}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none"
              placeholder="Nama"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none"
              placeholder="Phone (08xxxx)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={submit}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-5 text-sm font-extrabold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            {loading ? "Menyimpan..." : "Create Driver"}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-extrabold text-slate-900">
              Daftar Driver
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Total: <span className="text-slate-900">{drivers.length}</span>
            </div>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-extrabold">Name</th>
                  <th className="text-left py-3 px-4 font-extrabold">Phone</th>
                  <th className="text-left py-3 px-4 font-extrabold">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {drivers.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {d.name}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {d.phone}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-500">
                      {d.id}
                    </td>
                  </tr>
                ))}

                {drivers.length === 0 ? (
                  <tr>
                    <td className="py-5 px-4 text-slate-600" colSpan={3}>
                      Belum ada driver.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={load}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

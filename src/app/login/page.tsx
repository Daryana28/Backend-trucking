"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EyeIcon from "./EyeIcon";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // penting: kirim sesuai API kamu (username, password)
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      // API kamu mengembalikan { ok: true } saat sukses
      if (res.ok && data.ok) {
        router.push("/home");
      } else {
        setError(data.error || "User ID atau Password salah");
      }
    } catch (e) {
      setError("Gagal konek ke server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 w-screen overflow-hidden bg-slate-50">
      {/* 70/30: TEKS (70) kiri - LOGIN (30) kanan */}
      <div className="w-full md:grid md:grid-cols-[7fr_3fr] min-h-[100svh]">
        {/* ================= LEFT: HERO / TEKS (70%) ================= */}
        <div className="relative hidden md:block">
          <img
            src="/background.jpg"
            alt="Hero"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B2A67]/95 via-[#0B2A67]/75 to-[#0B2A67]/90" />
          <div className="absolute -right-24 top-12 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute left-10 bottom-10 h-80 w-80 rounded-full bg-sky-300/10 blur-3xl" />

          <div className="relative h-full px-10 py-10 text-white">
            <div className="flex items-center justify-between">
              <div className="text-xl font-extrabold tracking-tight">
                Delivery Tracking & Monitoring
              </div>
              <div className="rounded-full bg-red-500/90 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm">
                PT Indonesia Koito
              </div>
            </div>

            <div className="mt-16 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide backdrop-blur">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Live Delivery Updates
              </div>

              <h2 className="mt-6 text-4xl font-extrabold leading-tight">
                Pantau posisi delivery secara realtime.
              </h2>

              <p className="mt-4 text-sm font-semibold text-white/75">
                Dashboard ini membantu tim operasional memonitor perjalanan,
                memastikan delivery tepat waktu, dan melihat performa Plan vs
                Actual.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <div className="text-sm font-extrabold">
                    Realtime Tracking
                  </div>
                  <div className="mt-1 text-xs font-semibold text-white/75">
                    Lokasi driver & jalur perjalanan ter-update otomatis.
                  </div>
                </div>

                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <div className="text-sm font-extrabold">
                    Monitoring Progress
                  </div>
                  <div className="mt-1 text-xs font-semibold text-white/75">
                    Lihat On Progress vs Complete, cepat & jelas.
                  </div>
                </div>

                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <div className="text-sm font-extrabold">Plan vs Actual</div>
                  <div className="mt-1 text-xs font-semibold text-white/75">
                    Bandingkan durasi plan dengan aktual untuk evaluasi.
                  </div>
                </div>
              </div>

              <div className="mt-8 text-[11px] font-semibold text-white/70">
                Pastikan Anda login dengan akun yang terdaftar.
              </div>
            </div>

            <div className="absolute bottom-8 left-10 right-10 text-[11px] font-semibold text-white/60">
              Delivery Tracking System • Internal Use
            </div>
          </div>
        </div>

        {/* ================= RIGHT: LOGIN (30%) ================= */}
        <div className="relative flex items-center justify-center px-5 min-h-[100svh]">
          {/* background for mobile (since left hidden) */}
          <div className="absolute inset-0 md:hidden">
            <img
              src="/background.jpg"
              className="absolute inset-0 h-full w-full object-cover"
              alt="background"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-black/55 via-black/45 to-black/55 backdrop-blur-md" />
          </div>

          <div className="relative w-full max-w-md md:max-w-sm">
            {/* ✅ HAPUS TITIK PUTIH: dulu ini bikin bulatan putih karena logonya dikomentarin */}
            {/* <div className="mb-6 flex items-center justify-center md:hidden">
              <div className="rounded-full bg-white/90 p-3 shadow-lg"></div>
            </div> */}

            <div className="rounded-3xl border border-slate-200 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.12)] md:bg-white p-6 md:p-8">
              {/* logo (desktop) */}
              <div className="mb-6 hidden items-center justify-center md:flex">
                {/* <img
                  src="/koito.png"
                  alt="Logo"
                  className="h-14 w-14 object-contain"
                /> */}
              </div>

              <div className="text-center">
                <div className="text-base font-extrabold tracking-tight text-slate-900">
                  Sign in
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  Masuk untuk mengakses monitoring delivery.
                </div>
              </div>

              {error && (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-5 w-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {error}
                  </div>
                </div>
              )}

              <div className="mt-6 space-y-4">
                {/* USERNAME */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-slate-600">
                    Username
                  </label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    placeholder="Masukkan username"
                    autoComplete="username"
                  />
                </div>

                {/* PASSWORD */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-slate-600">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      placeholder="Masukkan password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      aria-label="Toggle password"
                    >
                      <EyeIcon open={showPass} />
                    </button>
                  </div>
                </div>

                {/* LOGIN BUTTON */}
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="mt-2 h-12 w-full rounded-xl bg-[#133E87] text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0f3372] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    "Masuk"
                  )}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    className="text-xs font-bold text-slate-500 hover:text-slate-700"
                    onClick={() => {}}
                  >
                    Lupa Password?
                  </button>
                </div>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-4 text-center text-[11px] font-semibold text-slate-400">
                Secure access • Delivery Monitoring System
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

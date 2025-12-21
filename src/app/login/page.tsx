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
    <div className="fixed inset-0 w-screen h-screen flex items-center justify-center overflow-hidden">
      {/* BACKGROUND IMG */}
      <img
        src="/background.jpg"
        className="absolute inset-0 w-full h-full object-cover"
        alt="background"
      />

      {/* ENHANCED BLUR OVERLAY */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/40 to-black/50 backdrop-blur-md" />

      {/* DECORATIVE ELEMENTS */}
      <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />

      {/* LOGIN BOX */}
      <div
        className="
          relative z-10 w-full max-w-md mx-4 px-10 py-12
          bg-white/95 backdrop-blur-2xl rounded-3xl 
          border border-white/50
          shadow-[0_20px_80px_rgba(0,0,0,0.4)]
          hover:shadow-[0_20px_100px_rgba(0,0,0,0.5)]
          transition-all duration-300
        "
      >
        {/* LOGO BULAT */}
        <div className="absolute -top-14 left-1/2 -translate-x-1/2">
          <div className="w-28 h-28 bg-gradient-to-br from-white to-gray-50 rounded-full shadow-2xl border-4 border-white/80 flex items-center justify-center">
            <img
              src="/koito.png"
              className="w-16 h-16 object-contain"
              alt="logo"
            />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent mb-2 mt-4">
          Trucking App
        </h1>
        <p className="text-center text-gray-500 text-sm mb-8">
          Sign in to continue
        </p>

        {error && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 text-red-700 border border-red-300 rounded-xl px-4 py-3 mb-6 text-sm shadow-sm animate-[shake_0.3s_ease-in-out]">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
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

        {/* FORM */}
        <div className="space-y-5">
          {/* USERNAME */}
          <div>
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-5 py-3.5 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm shadow-sm 
                         text-gray-900 placeholder-gray-400
                         focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none 
                         transition-all duration-200
                         hover:border-gray-300"
              placeholder="Enter your username"
            />
          </div>

          {/* PASSWORD */}
          <div>
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Password
            </label>

            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-3.5 pr-12 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm shadow-sm 
                           text-gray-900 placeholder-gray-400
                           focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none 
                           transition-all duration-200
                           hover:border-gray-300"
                placeholder="Enter your password"
              />

              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <EyeIcon open={showPass} />
              </button>
            </div>
          </div>

          {/* LOGIN BUTTON */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-4 mt-2 rounded-xl text-white font-bold text-base
                       bg-gradient-to-r from-blue-600 to-blue-700
                       hover:from-blue-700 hover:to-blue-800
                       active:scale-[0.98] 
                       shadow-lg shadow-blue-500/30
                       hover:shadow-xl hover:shadow-blue-500/40
                       transition-all duration-200
                       disabled:from-blue-400 disabled:to-blue-400 disabled:shadow-none
                       disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
              "LOGIN"
            )}
          </button>
        </div>

        {/* FOOTER TEXT */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-center text-xs text-gray-500">
            Secure login powered by Trucking App
          </p>
        </div>
      </div>
    </div>
  );
}

// src/app/components/AppSidebar.tsx

"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const GREEN = {
  base: "#1D4ED8",
  soft: "#E8F0FF",
  sage: "#94A3B8",
  ring: "#C7D5F5",
};

const MENU = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" as const },
  { href: "/live", label: "Live View", icon: "radio" as const },

  // ✅ selalu tampil
  { href: "/admin/plan", label: "Plan Delivery", icon: "plan" as const },
];

const GENERAL = [{ href: "/logout", label: "Logout", icon: "logout" as const }];

type IconName = "grid" | "radio" | "plan" | "logout";

function Icon({ name, active = false }: { name: IconName; active?: boolean }) {
  const stroke = active ? "#FFFFFF" : "#64748B";

  switch (name) {
    case "grid":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "radio":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="2" />
          <path d="M5 12a7 7 0 0 1 14 0" />
          <path d="M2 12a10 10 0 0 1 20 0" />
        </svg>
      );
    case "plan":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 4h6" />
          <path d="M9 4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      );
    case "logout":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    default:
      return null;
  }
}

function Clock() {
  const [now, setNow] = useState("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-xs font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
      {now}
    </div>
  );
}

function LogoutConfirmModal({
  open,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />

      <div className="relative h-full w-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="#1D4ED8"
                  strokeWidth="2"
                >
                  <path d="M12 9v4" strokeLinecap="round" />
                  <path d="M12 17h.01" strokeLinecap="round" />
                  <path
                    d="M10.29 3.86 2.82 17a2 2 0 0 0 1.71 3h14.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900">
                  Logout
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Yakin ingin logout? Kamu akan kembali ke halaman login.
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {loading && (
                <svg
                  className="animate-spin"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="white"
                    strokeOpacity="0.35"
                    strokeWidth="3"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              Ya, Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState<boolean>(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sidebar-open");
      if (saved !== null) setOpen(saved === "1");
    } catch {}
  }, []);

  // ✅ tetap ada (biar tidak ganggu kode lain), tapi tidak dipakai untuk menu
  const [role, setRole] = useState<"admin" | "user" | "">("");
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)asakai_role=([^;]+)/);
    const v = m ? decodeURIComponent(m[1]) : "";
    setRole(v === "admin" || v === "user" ? v : "");
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("sidebar-open", open ? "1" : "0");
    } catch {}
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const linkClass = (href: string) => {
    const active = pathname === href;
    return [
      "flex items-center gap-3 rounded-lg transition-all text-sm font-medium",
      open ? "px-3 py-2.5" : "p-2.5 justify-center",
      active
        ? "bg-blue-600 text-white shadow-md"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    ].join(" ");
  };

  const visibleMenu = MENU;

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const handleLogoutConfirm = async () => {
    setLogoutLoading(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });

      if (!res.ok) {
        window.location.href = "/api/auth/logout";
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      window.location.href = "/api/auth/logout";
    } finally {
      setLogoutLoading(false);
      setLogoutOpen(false);
    }
  };

  const content = useMemo(() => {
    if (React.isValidElement(children)) {
      return React.cloneElement(children as any, { sidebarOpen: open });
    }
    return children;
  }, [children, open]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-slate-200 shadow-sm">
        <div className="h-full flex items-center justify-between px-4 gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle sidebar"
              className="flex items-center justify-center h-10 w-10 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
              type="button"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-slate-700"
              >
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>

            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700 bg-blue-50 px-3 py-1.5 rounded-md border border-blue-200">
                Trucking Monitoring
              </span>
              <span className="text-sm font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-md border border-red-200">
                PT Indonesia Koito
              </span>
            </div>
          </div>

          <Clock />
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={[
          "fixed top-16 left-0 bottom-0 z-40 bg-white border-r border-slate-200",
          "transition-all duration-300 ease-in-out shadow-lg",
          open ? "w-64" : "w-0 sm:w-16",
          open ? "translate-x-0" : "-translate-x-full sm:translate-x-0",
        ].join(" ")}
      >
        <div className="h-full flex flex-col py-4">
          <nav className="flex-1 px-3 space-y-1">
            {visibleMenu.map((m) => {
              const active = pathname === m.href;
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className={linkClass(m.href)}
                  title={!open ? m.label : undefined}
                >
                  <Icon name={m.icon} active={active} />
                  {open && <span>{m.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="px-3 pt-4 border-t border-slate-200 space-y-1">
            {GENERAL.map((g) => {
              if (g.href === "/logout") {
                const active = pathname === g.href;
                return (
                  <button
                    key={g.href}
                    onClick={() => setLogoutOpen(true)}
                    className={[linkClass(g.href), "w-full"].join(" ")}
                    title={!open ? g.label : undefined}
                    type="button"
                    disabled={logoutLoading}
                  >
                    <Icon name={g.icon} active={active} />
                    {open && <span>{g.label}</span>}
                  </button>
                );
              }
              return null;
            })}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 top-16 bg-black/20 z-30 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Content */}
      <main
        className={[
          "pt-16 min-h-screen transition-all duration-300",
          open ? "sm:pl-64" : "sm:pl-16",
        ].join(" ")}
      >
        {content}
      </main>

      <LogoutConfirmModal
        open={logoutOpen}
        loading={logoutLoading}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={handleLogoutConfirm}
      />
    </div>
  );
}

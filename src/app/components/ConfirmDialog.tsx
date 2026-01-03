"use client";

import { useEffect } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  message?: string;

  cancelText?: string;
  confirmText?: string;

  loading?: boolean;

  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title = "Konfirmasi",
  message = "Apakah kamu yakin?",
  cancelText = "Batal",
  confirmText = "Ya",
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  // ESC to close
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // lock scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={() => {
          if (!loading) onCancel();
        }}
      />

      {/* Card */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden animate-[fadeIn_.15s_ease-out]">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="mt-0.5 h-10 w-10 shrink-0 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-blue-600"
              >
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </div>

            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900">
                {title}
              </div>
              <div className="mt-1 text-sm text-slate-600 leading-relaxed">
                {message}
              </div>
            </div>

            {/* Close */}
            <button
              type="button"
              onClick={() => {
                if (!loading) onCancel();
              }}
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100 active:bg-slate-200 transition"
              aria-label="Close"
              disabled={loading}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-slate-700"
              >
                <path d="M18 6 6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 active:bg-slate-100 transition disabled:opacity-60"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {loading && (
              <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin" />
            )}
            {confirmText}
          </button>
        </div>
      </div>

      {/* tiny animation keyframes */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(6px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

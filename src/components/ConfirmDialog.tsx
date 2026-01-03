// src/components/ConfirmDialog.tsx
"use client";

import React from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  cancelText = "Cancel",
  confirmText = "Confirm",
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Loading..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

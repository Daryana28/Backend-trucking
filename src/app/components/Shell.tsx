"use client";

import BhisaSidebar from "../BhisaSidebar";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen overflow-hidden relative">
      {/* Sidebar ala Bhisa */}
      <BhisaSidebar />

      {/* Map / Content */}
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

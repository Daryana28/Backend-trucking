"use client";

import dynamic from "next/dynamic";

const RealtimeMap = dynamic(() => import("@/app/components/RealtimeMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[60vh] flex items-center justify-center text-slate-500">
      Loading map...
    </div>
  ),
});

export default function LivePage() {
  return <RealtimeMap />;
}

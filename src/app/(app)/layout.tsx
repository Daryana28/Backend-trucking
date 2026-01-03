// src/app/(app)/layout.tsx

import AppSidebar from "@/app/components/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppSidebar>{children}</AppSidebar>;
}

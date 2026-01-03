// src/app/components/ClientLayout.tsx

"use client";

import { usePathname } from "next/navigation";
import Shell from "./Shell";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Halaman yang TIDAK memakai Shell
  const noShell = ["/login"];

  const useShell = !noShell.includes(pathname);

  if (!useShell) {
    return <>{children}</>;
  }

  return <Shell>{children}</Shell>;
}
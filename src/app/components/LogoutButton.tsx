"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem("admin_token");
    router.push("/login");
  }

  return (
    <button onClick={handleLogout} className="absolute top-4 right-4 z-50">
      <img
        src="/logout.png"
        alt="logout"
        className="w-8 h-8 opacity-90 hover:opacity-100 cursor-pointer"
      />
    </button>
  );
}

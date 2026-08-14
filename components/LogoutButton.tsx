"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="whitespace-nowrap text-xs font-medium text-white/40 transition-colors hover:text-white/80"
    >
      <span className="sm:hidden">登出</span>
      <span className="hidden sm:inline">登出 · Log out</span>
    </button>
  );
}

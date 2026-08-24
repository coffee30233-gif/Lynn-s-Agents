import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./LogoutButton";

export async function SiteHeader() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
      <span className="hidden truncate text-white/40 sm:inline">{user.email}</span>
      <Link href="/plans" className="whitespace-nowrap text-white/60 transition-colors hover:text-white">
        <span className="sm:hidden">我的行程</span>
        <span className="hidden sm:inline">我的行程 · Plans</span>
      </Link>
      <Link href="/history" className="whitespace-nowrap text-white/60 transition-colors hover:text-white">
        <span className="sm:hidden">歷史紀錄</span>
        <span className="hidden sm:inline">歷史紀錄 · History</span>
      </Link>
      <LogoutButton />
    </div>
  );
}

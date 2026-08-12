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
    <div className="flex items-center justify-end gap-4 text-sm">
      <span className="text-white/40">{user.email}</span>
      <Link href="/history" className="text-white/60 transition-colors hover:text-white">
        歷史紀錄 · History
      </Link>
      <LogoutButton />
    </div>
  );
}

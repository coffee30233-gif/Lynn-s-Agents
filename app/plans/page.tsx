import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPlansForUser } from "@/lib/plans/queries";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PlansPage() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (!supabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-950 px-6">
        <p className="text-sm text-white/40">
          Supabase 尚未設定，行程功能無法使用。 · Supabase isn&rsquo;t configured yet.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const plans = await listPlansForUser(supabase);

  return (
    <main className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">我的行程 · Plans</h1>
          <Link href="/" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← Lynn&rsquo;s Agents
          </Link>
        </div>

        {plans.length === 0 ? (
          <p className="text-sm text-white/40">
            還沒有儲存的行程。在跟活動安排助理聊天時，點回覆下方的「儲存為行程」就會出現在這裡。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/plans/${plan.id}`}
                  className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-white">{plan.title}</span>
                    <span className="shrink-0 text-xs text-white/30">{formatDate(plan.createdAt)}</span>
                  </div>
                  {plan.location && <span className="text-xs text-white/40">📍 {plan.location}</span>}
                  <p className="line-clamp-2 text-sm text-white/50">{plan.content}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

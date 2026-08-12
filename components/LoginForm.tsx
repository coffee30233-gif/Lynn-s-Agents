"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;

    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
        <p className="text-sm text-white/80">
          登入連結已寄出，請check你的信箱 · Check your email for the login link.
        </p>
        <p className="mt-2 text-xs text-white/40">{email}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
      />
      <button
        type="submit"
        disabled={status === "sending" || !email.trim()}
        className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-ink-950 transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === "sending" ? "傳送中... Sending..." : "取得登入連結 · Send magic link"}
      </button>
      {status === "error" && (
        <p className="text-center text-sm text-red-300">
          寄送失敗，請再試一次 · Something went wrong, please try again.
        </p>
      )}
    </form>
  );
}

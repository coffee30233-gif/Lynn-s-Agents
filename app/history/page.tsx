import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listConversationsForUser } from "@/lib/conversations/queries";
import { getCharacterById } from "@/lib/characters/registry";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function HistoryPage() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (!supabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-950 px-6">
        <p className="text-sm text-white/40">
          Supabase 尚未設定，對話歷史功能無法使用。 · Supabase isn&rsquo;t configured yet.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const conversations = await listConversationsForUser(supabase);

  return (
    <main className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">歷史紀錄 · History</h1>
          <Link href="/" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← Lynn&rsquo;s Agents
          </Link>
        </div>

        {conversations.length === 0 ? (
          <p className="text-sm text-white/40">還沒有對話紀錄。 · No conversations yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {conversations.map((conversation) => {
              const character = getCharacterById(conversation.characterId);
              if (!character) return null;

              return (
                <li key={conversation.id}>
                  <Link
                    href={`/chat/${character.id}?conversationId=${conversation.id}`}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
                  >
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15">
                      <Image src={character.avatar} alt={character.displayName} fill className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-white">
                          {character.displayName}
                        </span>
                        <span className="shrink-0 text-xs text-white/30">
                          {formatDate(conversation.updatedAt)}
                        </span>
                      </div>
                      {conversation.preview && (
                        <p className="truncate text-sm text-white/50">{conversation.preview}</p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

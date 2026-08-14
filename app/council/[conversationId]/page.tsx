import Link from "next/link";
import { notFound } from "next/navigation";
import { CouncilResults } from "@/components/CouncilResults";
import { createClient } from "@/lib/supabase/server";
import { getCouncilConversation } from "@/lib/conversations/queries";
import { getCharacterById } from "@/lib/characters/registry";

export default async function CouncilArchivePage({
  params,
}: {
  params: { conversationId: string };
}) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) notFound();

  const supabase = await createClient();
  const council = await getCouncilConversation(supabase, params.conversationId);
  if (!council || !council.synthesis) notFound();

  const panel = council.responses
    .map((r) => {
      const character = getCharacterById(r.characterId);
      return character ? { character, message: r.content, sources: r.sources } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <main className="safe-top min-h-dvh bg-ink-950">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/history" className="text-sm text-white/40 transition-colors hover:text-white/80">
          ← 歷史紀錄 · History
        </Link>
        <div className="mt-6">
          <CouncilResults question={council.question} panel={panel} synthesis={council.synthesis} />
        </div>
      </div>
    </main>
  );
}

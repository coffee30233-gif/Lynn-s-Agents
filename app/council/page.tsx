import Link from "next/link";
import { CouncilView } from "@/components/CouncilView";
import { DisclaimerBadge } from "@/components/DisclaimerBadge";
import { getAllCharacters } from "@/lib/characters/registry";

export default function CouncilPage() {
  const characters = getAllCharacters();

  return (
    <main className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-white/40 transition-colors hover:text-white/80">
            ← Lynn&rsquo;s Agents
          </Link>
          <DisclaimerBadge compact />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">Lynn&rsquo;s Council</h1>
        <p className="mt-1 text-sm text-white/50">Ask a panel. Get a synthesis.</p>
      </div>

      <CouncilView characters={characters} />
    </main>
  );
}

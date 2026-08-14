import Image from "next/image";
import Link from "next/link";
import type { CharacterProfile } from "@/types";
import { DisclaimerBadge } from "./DisclaimerBadge";

export function ChatHeader({ character }: { character: CharacterProfile }) {
  return (
    <header className="safe-top sticky top-0 z-10 border-b border-white/10 bg-ink-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Link
          href="/"
          aria-label="Back to Lynn's Agents"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15">
          <Image src={character.avatar} alt={character.displayName} fill className="object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-white">{character.displayName}</h1>
          <DisclaimerBadge compact />
        </div>

        {character.id === "event-planner" && (
          <Link
            href="/plans"
            className="shrink-0 text-xs font-medium text-white/40 transition-colors hover:text-white/80"
          >
            我的行程
          </Link>
        )}
        <Link
          href={`/history?characterId=${character.id}`}
          className="shrink-0 text-xs font-medium text-white/40 transition-colors hover:text-white/80"
        >
          歷史紀錄
        </Link>
      </div>
    </header>
  );
}

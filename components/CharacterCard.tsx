import Image from "next/image";
import Link from "next/link";
import type { CharacterProfile } from "@/types";

export function CharacterCard({ character }: { character: CharacterProfile }) {
  return (
    <Link
      href={`/chat/${character.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all duration-300 hover:border-white/25 hover:bg-white/[0.06]"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-ink-800">
        <Image
          src={character.avatar}
          alt={character.displayName}
          fill
          sizes="(max-width: 768px) 50vw, 20vw"
          className="object-cover grayscale transition-all duration-500 group-hover:scale-105 group-hover:grayscale-0"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
          {character.category}
        </span>
        <h3 className="text-base font-semibold text-white">{character.displayName}</h3>
        <p className="line-clamp-2 text-sm leading-snug text-white/50">{character.description}</p>
      </div>
    </Link>
  );
}

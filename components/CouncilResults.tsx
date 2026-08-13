import Image from "next/image";
import type { CharacterProfile, Source } from "@/types";
import { SourceLinks } from "./SourceLinks";
import { stripMarkdown } from "@/lib/text/stripMarkdown";

export interface CouncilPanelResult {
  character: CharacterProfile;
  message: string;
  sources?: Source[];
}

export function CouncilResults({
  question,
  panel,
  synthesis,
}: {
  question: string;
  panel: CouncilPanelResult[];
  synthesis: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="text-xs uppercase tracking-widest text-white/30">Question</p>
        <p className="mt-1 text-white">{question}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {panel.map(({ character, message, sources }) => (
          <div
            key={character.id}
            className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex items-center gap-2">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15">
                <Image src={character.avatar} alt={character.displayName} fill className="object-cover" />
              </div>
              <span className="text-sm font-semibold text-white">{character.displayName}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{stripMarkdown(message)}</p>
            <SourceLinks sources={sources} />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/20 bg-white/[0.06] p-5">
        <p className="text-xs font-medium uppercase tracking-widest text-white/50">
          Synthesis · 綜合結論
        </p>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-white">{stripMarkdown(synthesis)}</p>
      </div>
    </div>
  );
}

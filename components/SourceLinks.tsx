import type { Source } from "@/types";

function hostname(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}

export function SourceLinks({ sources }: { sources?: Source[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((source) => (
        <a
          key={source.uri}
          href={source.uri}
          target="_blank"
          rel="noopener noreferrer"
          title={source.title}
          className="max-w-[180px] truncate rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/50 transition-colors hover:border-white/25 hover:text-white/80"
        >
          {hostname(source.uri)}
        </a>
      ))}
    </div>
  );
}

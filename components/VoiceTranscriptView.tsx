import type { CharacterProfile, ChatMessage } from "@/types";
import { ChatHeader } from "./ChatHeader";
import { ChatBubble } from "./ChatBubble";

/**
 * Read-only view of a finished voice session, opened from this character's
 * history list. A Live API session itself can't be "resumed" (it's a live
 * WebSocket, not a stored conversation you can reconnect to) — this just
 * replays the saved transcript (see app/api/live/save-transcript/route.ts)
 * as chat bubbles, same as a text conversation would render.
 */
export function VoiceTranscriptView({
  character,
  messages,
}: {
  character: CharacterProfile;
  messages: ChatMessage[];
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <ChatHeader character={character} />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <p className="text-center text-xs text-white/30">這是一段已結束的語音對話逐字稿</p>
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} character={character} />
        ))}
      </div>
    </div>
  );
}

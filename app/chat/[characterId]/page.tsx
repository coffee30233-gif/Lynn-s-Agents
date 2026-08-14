import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { ChatView } from "@/components/ChatView";
import { VoiceTranscriptView } from "@/components/VoiceTranscriptView";
import { getAllCharacters, getCharacterById } from "@/lib/characters/registry";
import { createClient } from "@/lib/supabase/server";
import { getConversationWithMessages } from "@/lib/conversations/queries";
import type { ChatMessage } from "@/types";

// Only this character has a voice practice loop (Gemini Live API) instead of
// the standard text ChatView — see components/VoiceCoachView.tsx. Loaded via
// next/dynamic so its client-side @google/genai dependency only ships to
// people actually on this character's page, not bundled into every other
// character's chat route.
const VOICE_CHARACTER_IDS = ["english-coach"];
const VoiceCoachView = dynamic(() =>
  import("@/components/VoiceCoachView").then((mod) => mod.VoiceCoachView)
);

export function generateStaticParams() {
  return getAllCharacters().map((character) => ({ characterId: character.id }));
}

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: { characterId: string };
  searchParams: { conversationId?: string };
}) {
  const character = getCharacterById(params.characterId);
  if (!character) notFound();

  let initialMessages: ChatMessage[] | undefined;
  let initialConversationId: string | undefined;

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (supabaseConfigured && searchParams.conversationId) {
    const supabase = await createClient();
    const conversation = await getConversationWithMessages(supabase, searchParams.conversationId);
    if (conversation && conversation.characterId === character.id) {
      initialMessages = conversation.messages;
      initialConversationId = searchParams.conversationId;
    }
  }

  if (VOICE_CHARACTER_IDS.includes(character.id)) {
    // A Live API session can't be "resumed" — a conversationId here means
    // the user clicked a past session from history, so show its saved
    // transcript read-only instead of opening a new live connection.
    if (initialMessages) {
      return <VoiceTranscriptView character={character} messages={initialMessages} />;
    }
    return <VoiceCoachView character={character} />;
  }

  return (
    <ChatView
      character={character}
      initialMessages={initialMessages}
      initialConversationId={initialConversationId}
    />
  );
}

import { notFound } from "next/navigation";
import { ChatView } from "@/components/ChatView";
import { getAllCharacters, getCharacterById } from "@/lib/characters/registry";
import { createClient } from "@/lib/supabase/server";
import { getConversationWithMessages } from "@/lib/conversations/queries";
import type { ChatMessage } from "@/types";

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

  return (
    <ChatView
      character={character}
      initialMessages={initialMessages}
      initialConversationId={initialConversationId}
    />
  );
}

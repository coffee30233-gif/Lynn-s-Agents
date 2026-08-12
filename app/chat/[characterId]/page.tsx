import { notFound } from "next/navigation";
import { ChatView } from "@/components/ChatView";
import { getAllCharacters, getCharacterById } from "@/lib/characters/registry";

export function generateStaticParams() {
  return getAllCharacters().map((character) => ({ characterId: character.id }));
}

export default function ChatPage({ params }: { params: { characterId: string } }) {
  const character = getCharacterById(params.characterId);
  if (!character) notFound();

  return <ChatView character={character} />;
}

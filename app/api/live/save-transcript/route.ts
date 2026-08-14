import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCharacterById } from "@/lib/characters/registry";
import { createConversation, appendMessage } from "@/lib/conversations/queries";

interface TranscriptTurn {
  role: "user" | "coach";
  text: string;
}

/**
 * POST /api/live/save-transcript
 *
 * Saves a finished voice session as a regular conversation, reusing the same
 * conversations/messages tables text chat uses — so a voice session shows up
 * in this character's history page exactly like a text one would. Called
 * once when a Live API session ends; best-effort from the caller's side
 * (losing a transcript on save failure shouldn't be treated as the session
 * itself having failed, since the actual practice already happened).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { characterId?: string; transcript?: TranscriptTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const character = getCharacterById(body.characterId ?? "");
  if (!character) {
    return NextResponse.json({ error: `Unknown character "${body.characterId}"` }, { status: 404 });
  }

  const transcript = Array.isArray(body.transcript) ? body.transcript : [];
  if (transcript.length === 0) {
    return NextResponse.json({ error: "Empty transcript" }, { status: 400 });
  }

  const conversationId = await createConversation(supabase, user.id, {
    characterId: character.id,
    mode: "chat",
  });

  for (const turn of transcript) {
    if (!turn.text.trim()) continue;
    await appendMessage(
      supabase,
      conversationId,
      turn.role === "user" ? "user" : "assistant",
      turn.text,
      turn.role === "coach" ? character.id : undefined
    );
  }

  return NextResponse.json({ conversationId });
}

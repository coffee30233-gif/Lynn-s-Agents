import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentMode, ChatMessage, Source } from "@/types";

export interface ConversationSummary {
  id: string;
  characterId: string | null;
  councilCharacterIds: string[] | null;
  mode: AgentMode;
  updatedAt: string;
  preview: string | null;
}

export interface CouncilConversation {
  question: string;
  characterIds: string[];
  responses: { characterId: string; content: string; sources: Source[] }[];
  synthesis: string | null;
}

/**
 * All functions take an already-authenticated Supabase client (bound to the
 * request's cookies by lib/supabase/server.ts) — Row Level Security does the
 * actual ownership enforcement, these are just typed query helpers.
 */

type NewConversation =
  | { characterId: string; mode: AgentMode }
  | { councilCharacterIds: string[]; mode: AgentMode };

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  input: NewConversation
): Promise<string> {
  const row = {
    user_id: userId,
    character_id: "characterId" in input ? input.characterId : null,
    council_character_ids: "councilCharacterIds" in input ? input.councilCharacterIds : null,
    mode: input.mode,
  };

  const { data, error } = await supabase.from("conversations").insert(row).select("id").single();

  if (error || !data) throw new Error(`Failed to create conversation: ${error?.message}`);
  return data.id;
}

export async function appendMessage(
  supabase: SupabaseClient,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  characterId?: string,
  sources?: Source[]
): Promise<void> {
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role,
    content,
    character_id: characterId ?? null,
    sources: sources && sources.length > 0 ? sources : null,
  });
  if (insertError) throw new Error(`Failed to save message: ${insertError.message}`);

  const { error: touchError } = await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (touchError) throw new Error(`Failed to touch conversation: ${touchError.message}`);
}

export async function getConversationWithMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<{ characterId: string; mode: AgentMode; messages: ChatMessage[] } | null> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("character_id, mode")
    .eq("id", conversationId)
    .single();

  if (!conversation || !conversation.character_id) return null;

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, role, content, sources, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load messages: ${error.message}`);

  return {
    characterId: conversation.character_id,
    mode: conversation.mode,
    messages: (rows ?? []).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.created_at).getTime(),
      sources: row.sources ?? undefined,
    })),
  };
}

export async function getCouncilConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<CouncilConversation | null> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("council_character_ids")
    .eq("id", conversationId)
    .single();

  if (!conversation || !conversation.council_character_ids) return null;

  const { data: rows, error } = await supabase
    .from("messages")
    .select("role, content, character_id, sources, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load council messages: ${error.message}`);

  const question = rows?.find((r) => r.role === "user")?.content ?? "";
  const synthesis = rows?.find((r) => r.character_id === "synthesis")?.content ?? null;
  const responses = (rows ?? [])
    .filter((r) => r.role === "assistant" && r.character_id && r.character_id !== "synthesis")
    .map((r) => ({
      characterId: r.character_id as string,
      content: r.content,
      sources: r.sources ?? [],
    }));

  return {
    question,
    characterIds: conversation.council_character_ids,
    responses,
    synthesis,
  };
}

export async function listConversationsForUser(
  supabase: SupabaseClient,
  characterId?: string
): Promise<ConversationSummary[]> {
  let query = supabase
    .from("conversations")
    .select("id, character_id, council_character_ids, mode, updated_at")
    .order("updated_at", { ascending: false });

  // Scoped to a single character (called from that character's own chat
  // page) — deliberately excludes Council sessions even if this character
  // was on the panel, since "chatting with X" means the 1:1 conversation,
  // not a multi-agent one. Omitting characterId (the homepage's history
  // link) lists everything, Council included.
  if (characterId) query = query.eq("character_id", characterId);

  const { data: conversations, error } = await query;

  if (error) throw new Error(`Failed to list conversations: ${error.message}`);
  if (!conversations || conversations.length === 0) return [];

  const previews = await Promise.all(
    conversations.map((c) =>
      supabase
        .from("messages")
        .select("content")
        .eq("conversation_id", c.id)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    )
  );

  return conversations.map((c, i) => ({
    id: c.id,
    characterId: c.character_id,
    councilCharacterIds: c.council_character_ids,
    mode: c.mode,
    updatedAt: c.updated_at,
    preview: previews[i].data?.content ?? null,
  }));
}

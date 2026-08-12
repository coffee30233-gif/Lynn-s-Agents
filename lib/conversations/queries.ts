import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentMode, ChatMessage } from "@/types";

export interface ConversationSummary {
  id: string;
  characterId: string;
  mode: AgentMode;
  updatedAt: string;
  preview: string | null;
}

/**
 * All functions take an already-authenticated Supabase client (bound to the
 * request's cookies by lib/supabase/server.ts) — Row Level Security does the
 * actual ownership enforcement, these are just typed query helpers.
 */

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  characterId: string,
  mode: AgentMode
): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, character_id: characterId, mode })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create conversation: ${error?.message}`);
  return data.id;
}

export async function appendMessage(
  supabase: SupabaseClient,
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const { error: insertError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role, content });
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

  if (!conversation) return null;

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
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
    })),
  };
}

export async function listConversationsForUser(
  supabase: SupabaseClient
): Promise<ConversationSummary[]> {
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, character_id, mode, updated_at")
    .order("updated_at", { ascending: false });

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
    mode: c.mode,
    updatedAt: c.updated_at,
    preview: previews[i].data?.content ?? null,
  }));
}

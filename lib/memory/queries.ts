import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LIMIT = 15;
const MAX_CHARS_PER_MEMORY = 240;

/**
 * Cross-conversation, cross-character memory: recent things this user has
 * said in conversations OTHER than the current one. Shared across all
 * characters by design — no per-character isolation. RLS on `messages`
 * already scopes this to the authenticated user; no explicit user_id filter
 * needed here.
 */
export async function getUserMemories(
  supabase: SupabaseClient,
  options: { excludeConversationId?: string; limit?: number } = {}
): Promise<string[]> {
  const { excludeConversationId, limit = DEFAULT_LIMIT } = options;

  let query = supabase
    .from("messages")
    .select("content, conversation_id")
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (excludeConversationId) {
    query = query.neq("conversation_id", excludeConversationId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load memories: ${error.message}`);

  return (data ?? []).map((row) =>
    row.content.length > MAX_CHARS_PER_MEMORY
      ? `${row.content.slice(0, MAX_CHARS_PER_MEMORY)}…`
      : row.content
  );
}

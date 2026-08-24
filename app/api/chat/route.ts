import { NextRequest, NextResponse } from "next/server";
import type { AgentMode, ChatRequestBody, ChatResponseBody } from "@/types";
import { getCharacterById } from "@/lib/characters/registry";
import { loadSkill } from "@/lib/characters/loader";
import { buildSystemPrompt } from "@/lib/agent/promptBuilder";
import { getCharacterReply } from "@/lib/agent/reply";
import type { ConversationTurn } from "@/lib/agent/gemini";
import { createClient } from "@/lib/supabase/server";
import { appendMessage, createConversation, getMessagesForConversation } from "@/lib/conversations/queries";
import { getUserMemories } from "@/lib/memory/queries";
import { parseExpenses } from "@/lib/text/parseExpense";
import { writeExpenseToPassbook } from "@/lib/passbook/client";

// Vercel's default serverless timeout (10s on Hobby) is too short once
// multi-turn history + Google Search grounding make Gemini calls slower.
export const maxDuration = 60;

function isValidMode(mode: unknown): mode is AgentMode {
  return typeof mode === "string" && ["chat", "think", "plan", "learn", "do"].includes(mode);
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { characterId, message } = body;
  let conversationId = body.conversationId;
  const mode: AgentMode = isValidMode(body.mode) ? body.mode : "chat";

  if (!characterId || typeof characterId !== "string") {
    return NextResponse.json({ error: "characterId is required" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const character = getCharacterById(characterId);
  if (!character) {
    return NextResponse.json({ error: `Unknown character "${characterId}"` }, { status: 404 });
  }

  const skill = loadSkill(character);

  // Same local-dev-convenience pattern as GEMINI_API_KEY (see getCharacterReply's
  // mock fallback): without Supabase configured, chat still works, it just
  // isn't persisted anywhere — and without persistence there's no history to
  // reconstruct or memory to draw
  // on, so each call is a single-turn exchange like before.
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const supabase = supabaseConfigured ? await createClient() : null;

  let messages: ConversationTurn[] = [{ role: "user", content: message }];
  let memories: string[] = [];
  let userEmail: string | null = null;
  let pendingUserAppend: Promise<void> | null = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userEmail = user.email ?? null;

    const isNewConversation = !conversationId;
    const convId: string = isNewConversation
      ? await createConversation(supabase, user.id, { characterId: character.id, mode })
      : conversationId!;
    conversationId = convId;

    // Reading this conversation's earlier turns and reading memories (a
    // different query, and one that structurally excludes convId via .neq)
    // don't race with each other, so they run together. Appending the new
    // user turn is a write to the exact rows the history read just read —
    // it has to happen after that read resolves, not concurrently with it,
    // or the read could occasionally catch its own write mid-flight and
    // double up this turn in what gets sent to Gemini.
    const [priorMessages, userMemories] = await Promise.all([
      isNewConversation ? Promise.resolve([]) : getMessagesForConversation(supabase, convId),
      character.memory.enabled ? getUserMemories(supabase, { excludeConversationId: convId }) : Promise.resolve([]),
    ]);
    messages = [...priorMessages.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: message }];
    memories = userMemories;

    // Not awaited here on purpose: nothing downstream needs this write to
    // have landed before calling Gemini (messages/memories are already in
    // hand above), so let it finish in the background while the slow model
    // call runs instead of sitting on the critical path. Still awaited
    // before the response goes out (below) so the request doesn't return
    // — and the serverless function doesn't get frozen — with it unfinished.
    pendingUserAppend = appendMessage(supabase, convId, "user", message);
  }

  const systemPrompt = buildSystemPrompt(character, skill, mode, memories);
  const result = await getCharacterReply(character.id, systemPrompt, messages, conversationId, mode);

  // Flush the backgrounded user-message write before any return path below —
  // otherwise an early return (e.g. the error branch right after this) could
  // let the serverless function finish while it's still in flight, and it
  // never gets to run at all.
  if (pendingUserAppend) await pendingUserAppend;

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (supabase && conversationId) {
    await appendMessage(supabase, conversationId, "assistant", result.message, character.id, result.sources);
  }

  // Only this character emits 💰 記帳 blocks — writes each one to the
  // user's separate passbook app. Best-effort: a failed write here doesn't
  // fail the chat response, since the reply already exists either way.
  //
  // Gated to OWNER_EMAIL specifically: the passbook write uses one shared
  // secret with no per-user scoping on my-passbook-app's side (it's a
  // single-user app with no account system), so without this check ANY
  // account that can log into Lynn's Agents — and by default anyone can
  // self-register via magic link or Google sign-in — would be writing into
  // the site owner's real financial data. Silently skips the write for
  // everyone else rather than surfacing an error, since a non-owner
  // shouldn't be able to tell this integration exists at all.
  let expenseSync: ChatResponseBody["expenseSync"];
  if (character.id === "expense-tracker" && userEmail && userEmail === process.env.OWNER_EMAIL) {
    const expenses = parseExpenses(result.message);
    if (expenses.length > 0) {
      const outcomes = await Promise.all(expenses.map((e) => writeExpenseToPassbook(e)));
      const failed = outcomes.filter((o) => !o.ok);
      failed.forEach((o) => console.error("[expense-tracker] passbook write failed:", o.error));
      expenseSync = { saved: outcomes.length - failed.length, failed: failed.length };
    }
  }

  const response: ChatResponseBody = {
    characterId: character.id,
    message: result.message,
    conversationId: conversationId ?? crypto.randomUUID(),
    sources: result.sources,
    expenseSync,
  };
  return NextResponse.json(response);
}

import type { AgentMode } from "@/types";

interface ModeDefinition {
  id: AgentMode;
  label: string;
  instruction: string;
  implemented: boolean;
}

/**
 * Behavior guidance appended to the system prompt per mode. Only "chat" is
 * wired to the UI in Phase 1 — the rest exist so the data model and prompt
 * layer don't need to change shape when Think/Plan/Learn/Do ship later.
 */
export const MODES: Record<AgentMode, ModeDefinition> = {
  chat: {
    id: "chat",
    label: "Chat",
    instruction: "Have an open, natural conversation. Respond the way this person would actually talk.",
    implemented: true,
  },
  think: {
    id: "think",
    label: "Think",
    instruction: "Help the user reason through a problem: surface assumptions, ask sharpening questions, give a structured take.",
    implemented: false,
  },
  plan: {
    id: "plan",
    label: "Plan",
    instruction: "Help the user turn a goal into a concrete, sequenced plan with clear next steps.",
    implemented: false,
  },
  learn: {
    id: "learn",
    label: "Learn",
    instruction: "Teach the user a concept the way this person would teach it — build intuition, not just facts.",
    implemented: false,
  },
  do: {
    id: "do",
    label: "Do",
    instruction: "Execute a concrete task on the user's behalf using available tools.",
    implemented: false,
  },
};

export function getModeInstruction(mode: AgentMode): string {
  return (MODES[mode] ?? MODES.chat).instruction;
}

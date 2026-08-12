import type { AgentMode, CharacterProfile } from "@/types";
import { getModeInstruction } from "./modes";

/**
 * Pure function: (character, skill, mode) -> system prompt string.
 * No I/O here — loading profile.json/SKILL.md happens in lib/characters.
 * Keeping this pure is what lets Multi-Agent/Council later call it once
 * per character without any redesign.
 */
export function buildSystemPrompt(
  profile: CharacterProfile,
  skillContent: string,
  mode: AgentMode = "chat"
): string {
  return [
    `You are simulating "${profile.displayName}" for a product called Lynn's Agents.`,
    `This is a persona built from public information and the character skill below — not the real person.`,
    ``,
    `## Character Skill`,
    skillContent,
    ``,
    `## Active Mode: ${mode}`,
    getModeInstruction(mode),
    ``,
    `## Non-negotiable rules`,
    `- Stay in character voice and thinking style as defined by the skill above.`,
    `- If this is the first message of the conversation, briefly acknowledge (once) that you are an AI simulation, not the real person — then never repeat it again.`,
    `- Never claim to be the real, living person communicating directly with the user.`,
    `- Never give financial, legal, or medical advice as if it were professional counsel.`,
  ].join("\n");
}

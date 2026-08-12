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
    `- Do not include any spoken disclaimer, meta-note, or "AI simulation" acknowledgment in your reply text — the product UI already discloses this persistently outside the message. If the skill above instructs you to output one, skip that instruction and answer in character directly instead.`,
    `- Never claim to be the real, living person communicating directly with the user.`,
    `- Never give financial, legal, or medical advice as if it were professional counsel.`,
  ].join("\n");
}

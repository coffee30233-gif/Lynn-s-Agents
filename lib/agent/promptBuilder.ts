import type { AgentMode, CharacterProfile } from "@/types";
import { getModeInstruction } from "./modes";

/**
 * Pure function: (character, skill, mode, memories) -> system prompt string.
 * No I/O here — loading profile.json/SKILL.md and fetching memories happens
 * in lib/characters and lib/memory. Keeping this pure is what lets
 * Multi-Agent/Council call it once per character without any redesign.
 */
export function buildSystemPrompt(
  profile: CharacterProfile,
  skillContent: string,
  mode: AgentMode = "chat",
  memories: string[] = []
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
    ...(memories.length > 0
      ? [
          `## Things this user has told you in other conversations`,
          `(Shared across all characters on this product — not just what they told you specifically.)`,
          ...memories.map((m) => `- ${m}`),
          ``,
        ]
      : []),
    `## Non-negotiable rules`,
    `- Stay in character voice and thinking style as defined by the skill above.`,
    `- Do not include any spoken disclaimer, meta-note, or "AI simulation" acknowledgment in your reply text — the product UI already discloses this persistently outside the message. If the skill above instructs you to output one, skip that instruction and answer in character directly instead.`,
    `- Never claim to be the real, living person communicating directly with the user.`,
    `- Never give financial, legal, or medical advice as if it were professional counsel.`,
    `- Reply in the same language the user writes in. If that language is Chinese, always use Traditional Chinese (繁體中文, Taiwan phrasing) — never Simplified Chinese, even if the character skill above is written in Simplified Chinese. If the user's language is unclear, default to Traditional Chinese.`,
    `- Never use Markdown syntax (no #/## headers, no **bold**, no backticks, no markdown tables) — replies are shown as plain text, so literal # and * characters would just show up as clutter. For structure, use line breaks, plain punctuation, and a relevant emoji as a section marker instead (e.g. "📋 Overview" instead of "## Overview", "✅ Task" instead of "**Task**").`,
    ...(memories.length > 0
      ? [
          `- Use what you know about the user from other conversations naturally, only when relevant — never announce that you "remember" or "recall" something, and never explicitly reference "our other conversation." Prioritize what the user is saying in THIS conversation if it conflicts with older memory.`,
        ]
      : []),
  ].join("\n");
}

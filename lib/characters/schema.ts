import type { AgentMode, CharacterProfile } from "@/types";

const VALID_MODES: AgentMode[] = ["chat", "think", "plan", "learn", "do"];

export class InvalidProfileError extends Error {}

/**
 * Validates raw JSON against the CharacterProfile shape at runtime, since
 * profile.json files are hand-edited content, not type-checked code.
 */
export function parseCharacterProfile(raw: unknown, sourcePath: string): CharacterProfile {
  if (typeof raw !== "object" || raw === null) {
    throw new InvalidProfileError(`${sourcePath}: profile.json must be an object`);
  }

  const p = raw as Record<string, unknown>;
  const required = ["id", "name", "displayName", "category", "description", "avatar", "skillPath"];
  for (const key of required) {
    if (typeof p[key] !== "string" || p[key] === "") {
      throw new InvalidProfileError(`${sourcePath}: missing or invalid required field "${key}"`);
    }
  }

  const modes: AgentMode[] = Array.isArray(p.modes)
    ? (p.modes as unknown[]).filter((m): m is AgentMode => VALID_MODES.includes(m as AgentMode))
    : ["chat"];

  const voiceRaw = (p.voice as Record<string, unknown>) ?? {};
  const memoryRaw = (p.memory as Record<string, unknown>) ?? {};

  return {
    id: p.id as string,
    name: p.name as string,
    displayName: p.displayName as string,
    category: p.category as string,
    description: p.description as string,
    avatar: p.avatar as string,
    skillPath: p.skillPath as string,
    enabled: typeof p.enabled === "boolean" ? p.enabled : true,
    modes: modes.length > 0 ? modes : ["chat"],
    voice: {
      enabled: typeof voiceRaw.enabled === "boolean" ? voiceRaw.enabled : false,
      provider: typeof voiceRaw.provider === "string" ? voiceRaw.provider : null,
      voiceId: typeof voiceRaw.voiceId === "string" ? voiceRaw.voiceId : null,
    },
    tools: Array.isArray(p.tools) ? (p.tools as string[]) : [],
    memory: {
      enabled: typeof memoryRaw.enabled === "boolean" ? memoryRaw.enabled : false,
    },
  };
}

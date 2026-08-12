import fs from "node:fs";
import path from "node:path";
import type { CharacterProfile } from "@/types";
import { parseCharacterProfile } from "./schema";

const CHARACTERS_DIR = path.join(process.cwd(), "characters");

export function loadProfile(characterId: string): CharacterProfile {
  const profilePath = path.join(CHARACTERS_DIR, characterId, "profile.json");
  const raw = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
  return parseCharacterProfile(raw, profilePath);
}

/**
 * Reads the character's SKILL.md verbatim. This file is the persona's
 * source of truth (owned externally, not authored in this repo) — the
 * loader must never transform or summarize it.
 */
export function loadSkill(profile: CharacterProfile): string {
  const skillPath = path.join(process.cwd(), profile.skillPath);
  if (!fs.existsSync(skillPath)) {
    return `<!-- PLACEHOLDER: SKILL.md not found for "${profile.id}" at ${profile.skillPath}. -->`;
  }
  return fs.readFileSync(skillPath, "utf-8");
}

export function listCharacterIds(): string[] {
  if (!fs.existsSync(CHARACTERS_DIR)) return [];
  return fs.readdirSync(CHARACTERS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => fs.existsSync(path.join(CHARACTERS_DIR, id, "profile.json")));
}

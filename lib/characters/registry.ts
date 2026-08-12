import type { CharacterProfile } from "@/types";
import { listCharacterIds, loadProfile } from "./loader";

/**
 * Scans characters/ once per request. Adding a new character folder with a
 * valid profile.json is enough for it to show up here — no code changes.
 */
export function getAllCharacters(): CharacterProfile[] {
  return listCharacterIds()
    .map((id) => {
      try {
        return loadProfile(id);
      } catch {
        return null;
      }
    })
    .filter((p): p is CharacterProfile => p !== null && p.enabled);
}

export function getCharacterById(id: string): CharacterProfile | null {
  try {
    const profile = loadProfile(id);
    return profile.enabled ? profile : null;
  } catch {
    return null;
  }
}

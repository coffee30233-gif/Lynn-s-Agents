# 旅行規劃助理

This character has no chat interface — its homepage card (`href` in
`profile.json`) links straight to `/trips` instead of `/chat/trip-planner`.
It exists purely so the trip planner shows up in the homepage character grid
alongside the other characters, for a consistent way to find it (same
arrangement as the meeting assistant).

This file is never read: `loadSkill()`/`buildSystemPrompt()` are only called
from the `/api/chat` and Live-token-minting paths, and this character never
reaches either. The actual prompts live in `lib/trips/gemini.ts`.

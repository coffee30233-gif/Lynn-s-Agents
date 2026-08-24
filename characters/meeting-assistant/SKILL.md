# 會議助理

This character has no chat interface — its homepage card (`href` in
`profile.json`) links straight to `/meetings` instead of `/chat/meeting-assistant`.
It exists purely so the meeting assistant shows up in the homepage character
grid alongside the other characters, for a consistent way to find it.

This file is never read: `loadSkill()`/`buildSystemPrompt()` are only called
from the `/api/chat` and Live-token-minting paths, and this character never
reaches either.

# n8n Workflow — Lynn's Agents Chat

This is what `app/api/chat/route.ts` calls in Phase 2. Build this manually in your n8n
instance; the code side (`lib/n8n/client.ts`) already expects this exact shape.

## What our server sends

Our Next.js `/api/chat` route already does the character/skill work (load `profile.json`,
read `SKILL.md`, build the system prompt, reconstruct the conversation's message history from
Supabase) before calling n8n. n8n's only job is: take a system prompt + the turn history, call
Gemini, hand back the text. This keeps character data and conversation state in one place (this
repo/Supabase) instead of being duplicated inside n8n.

```json
POST {N8N_WEBHOOK_URL}
Headers: { "X-Webhook-Secret": "{N8N_WEBHOOK_SECRET}" }

{
  "characterId": "elon-musk",
  "systemPrompt": "...full prompt built from SKILL.md + mode rules + memory...",
  "messages": [
    { "role": "user", "content": "我想創業，但不知道從哪開始。" },
    { "role": "assistant", "content": "先算原材料..." },
    { "role": "user", "content": "那第一步該做什麼？" }
  ],
  "conversationId": "optional-id",
  "mode": "chat"
}
```

`messages` is the full turn history for this conversation, oldest first, latest user turn last —
not just the newest message. This is what makes follow-up questions ("那 X 呢？") actually work;
without it, every call to Gemini was stateless and had no idea what was said two messages ago.

## Nodes

**1. Webhook** (trigger)
- Method: `POST`
- Path: e.g. `lynns-agents-chat` — this becomes your `N8N_WEBHOOK_URL`
- Authentication: **Header Auth**
  - Create a credential of type Header Auth: Name = `X-Webhook-Secret`, Value = the same
    string you'll put in `N8N_WEBHOOK_SECRET` in `.env.local`
- Respond: **"Using Respond to Webhook Node"** (not immediately) — we need to wait for
  Gemini before responding

**2. HTTP Request — "Call Gemini"**
- Method: `POST`
- URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`
  (switched from `gemini-2.0-flash` after hitting free-tier quota — verify this exact model id still
  matches what's listed at https://ai.google.dev/gemini-api/docs/rate-limits before relying on it)
- Query Parameter: `key` = `{{ $env.GEMINI_API_KEY }}` (set `GEMINI_API_KEY` as an n8n
  environment variable — never hardcode it in the node)
- Body → **Specify Body: "Using Fields Below"** — not "Using JSON" as a literal text block. `systemPrompt`
  is a full SKILL.md (multi-KB, contains newlines); pasting it into a text-templated JSON body breaks on
  the first raw newline ("Bad control character in string literal"). Fields Below mode evaluates each
  value as a real expression and lets n8n serialize it correctly:

  | Name | Value (expression) |
  |---|---|
  | `system_instruction` | `{{ { parts: [ { text: $json.body.systemPrompt } ] } }}` |
  | `contents` | `{{ $json.body.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) }}` |
  | `generationConfig` | `{{ { temperature: 0.9, maxOutputTokens: 8192 } }}` |

  Note the `contents` mapping: Gemini calls the assistant turn `"model"`, not `"assistant"` — our
  own internal role name doesn't match Gemini's, so this expression translates it.

**3. Code — "Shape Response"**
- Pulls the reply text out of Gemini's response and reshapes it to match our contract:

```js
const geminiResponse = $input.first().json;
const parts = geminiResponse?.candidates?.[0]?.content?.parts ?? [];
const text = parts.map((p) => p.text).filter(Boolean).join("")
  || "Sorry, I couldn't generate a response just now.";

const webhookBody = $('Webhook').first().json.body;

// n8n's Code node sandbox doesn't expose the global `crypto` object, so
// don't use crypto.randomUUID() here — build a plain fallback id instead.
const conversationId = webhookBody.conversationId
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

return [{
  json: {
    characterId: webhookBody.characterId,
    message: text,
    conversationId,
  },
}];
```

**4. Respond to Webhook**
- Respond With: **"Text"** — not "JSON" (that mode's Response Body field parses its content as
  literal JSON text, so a bare `={{ $json }}` fails as "Invalid JSON in 'Response Body' field")
- Response Body: `={{ JSON.stringify($json) }}`
- Options → Response Headers: add `Content-Type: application/json`
- Response Code: `200`

## Error path

Add an **IF** node right after "Call Gemini" checking whether the HTTP Request errored
(enable "Continue On Fail" on that node so the workflow doesn't just die), branching to a
second **Respond to Webhook** node that returns:

```json
{ "error": "Gemini request failed" }
```
with status code `502`.

## Testing the webhook directly

```bash
curl -X POST "$N8N_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $N8N_WEBHOOK_SECRET" \
  -d '{"characterId":"elon-musk","systemPrompt":"You are Elon Musk.","messages":[{"role":"user","content":"Hello"}],"mode":"chat"}'
```

Once this returns a proper `{ characterId, message, conversationId }` JSON, put the
webhook URL and secret into `.env.local` and the app will use real Gemini responses
instead of the mock.

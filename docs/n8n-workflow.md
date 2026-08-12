# n8n Workflow — Lynn's Agents Chat

This is what `app/api/chat/route.ts` calls in Phase 2. Build this manually in your n8n
instance; the code side (`lib/n8n/client.ts`) already expects this exact shape.

## What our server sends

Our Next.js `/api/chat` route already does the character/skill work (load `profile.json`,
read `SKILL.md`, build the system prompt) before calling n8n. n8n's only job is: take a
system prompt + a message, call Gemini, hand back the text. This keeps character data in
one place (this repo) instead of being duplicated inside n8n.

```json
POST {N8N_WEBHOOK_URL}
Headers: { "X-Webhook-Secret": "{N8N_WEBHOOK_SECRET}" }

{
  "characterId": "elon-musk",
  "systemPrompt": "...full prompt built from SKILL.md + mode rules...",
  "message": "我想創業，但不知道從哪開始。",
  "conversationId": "optional-id",
  "mode": "chat"
}
```

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
- URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- Query Parameter: `key` = `{{ $env.GEMINI_API_KEY }}` (set `GEMINI_API_KEY` as an n8n
  environment variable — never hardcode it in the node)
- Body (JSON), using expressions to pull from the webhook payload:

```json
{
  "system_instruction": {
    "parts": [{ "text": "={{ $json.body.systemPrompt }}" }]
  },
  "contents": [
    { "role": "user", "parts": [{ "text": "={{ $json.body.message }}" }] }
  ],
  "generationConfig": { "temperature": 0.9, "maxOutputTokens": 800 }
}
```

**3. Code — "Shape Response"**
- Pulls the reply text out of Gemini's response and reshapes it to match our contract:

```js
const geminiResponse = $input.first().json;
const text = geminiResponse?.candidates?.[0]?.content?.parts?.[0]?.text
  ?? "Sorry, I couldn't generate a response just now.";

const webhookBody = $('Webhook').first().json.body;

return [{
  json: {
    characterId: webhookBody.characterId,
    message: text,
    conversationId: webhookBody.conversationId || crypto.randomUUID(),
  },
}];
```

**4. Respond to Webhook**
- Response Body: `={{ $json }}`
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
  -d '{"characterId":"elon-musk","systemPrompt":"You are Elon Musk.","message":"Hello","mode":"chat"}'
```

Once this returns a proper `{ characterId, message, conversationId }` JSON, put the
webhook URL and secret into `.env.local` and the app will use real Gemini responses
instead of the mock.

import { ApiError, type GenerateContentResponse } from "@google/genai";

// A retry needs real time to have any chance of finishing — an actual
// Vercel timeout observed in production showed 3 POSTs to Gemini (one file
// upload + TWO generateContent attempts) before the function got killed at
// 60s: the retry itself was what used up the remaining budget on an already
// borderline-slow request. Below this much remaining time, don't retry at
// all — surface the error immediately and let the user's own retry start a
// fresh attempt with a fresh 60s budget, rather than silently burning the
// current one on a retry that can't finish.
const MIN_REMAINING_MS_TO_RETRY = 15_000;

// 503 (model overloaded) and 429 (rate limited) are both "try again shortly"
// per Google's own guidance, and observed in practice (a fresh flash-tier
// model can be genuinely overloaded at times) — worth a quick retry here
// rather than always pushing that back onto the user, but only when there's
// actually enough of the 60s budget left for it (see above). Shared by the
// meeting assistant and the trip planner.
export async function generateContentWithRetry(
  call: () => Promise<GenerateContentResponse>,
  deadline: number
): Promise<GenerateContentResponse> {
  const delaysMs = [2000, 5000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const isTransient = err instanceof ApiError && (err.status === 503 || err.status === 429);
      const remaining = deadline - Date.now();
      if (!isTransient || attempt >= delaysMs.length || remaining < MIN_REMAINING_MS_TO_RETRY) {
        if (isTransient) console.log(`[gemini] not retrying — ${remaining}ms left, ${(err as ApiError).status}`);
        throw err;
      }
      console.log(`[gemini] generateContent got ${(err as ApiError).status}, retrying in ${delaysMs[attempt]}ms`);
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

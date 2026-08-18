const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    // Forces Google to hand back a refresh_token even if this user already
    // granted access before — without it, a reconnect after a revoke would
    // silently come back with no refresh_token at all.
    prompt: "consent",
    scope: SCOPE,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForRefreshToken(code: string, redirectUri: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  if (!data.refresh_token) {
    throw new Error(
      "Google didn't return a refresh_token (already authorized without prompt=consent?)"
    );
  }
  return data.refresh_token as string;
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google access token refresh failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  return data.access_token as string;
}

function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export interface CalendarEventInput {
  title: string;
  location?: string | null;
  /** "YYYY-MM-DD" — plans only carry a date, not a time, so this always
   * becomes an all-day event. Users can open it in Google Calendar
   * afterward to pin an exact time if they want one. */
  date: string;
  description?: string;
}

// Google Calendar custom event IDs must match ^[a-v0-9]{5,1024}$ (lowercase
// base32hex). A plan's Supabase id is a UUID — its hex digits (0-9a-f)
// already fall inside a-v once the hyphens are stripped, so this doubles as
// a deterministic idempotency key: two sync attempts for the same plan can
// never create two different events, since they'd both compute the same id.
function planEventId(planId: string): string {
  return planId.replace(/-/g, "");
}

/**
 * Creates the plan's event on first sync, or patches the same event on
 * every later sync (existingEventId comes from plans.google_event_id) so
 * re-syncing after editing a plan updates it in place instead of creating
 * a duplicate.
 *
 * The create path used to let Google generate a random event id, which had
 * no protection against being called twice for the same plan (e.g. the
 * create-on-save sync and the page-load backfill sync racing, or a create
 * succeeding on Google's side right before the DB write that records
 * google_event_id failed) — each call just made a brand new event. Passing
 * a deterministic id on create closes that: a duplicate create attempt gets
 * a 409 from Google instead of a second event, which is handled below by
 * switching to PATCH against that same id.
 */
export async function upsertCalendarEvent(
  refreshToken: string,
  existingEventId: string | null,
  planId: string,
  input: CalendarEventInput,
  /** Internal — caps the self-healing fallbacks below to one retry each,
   * so a pathological back-and-forth can't recurse forever. */
  _retried = false
): Promise<string> {
  const accessToken = await getAccessToken(refreshToken);

  const body: Record<string, unknown> = {
    summary: input.title,
    location: input.location || undefined,
    description: input.description || undefined,
    start: { date: input.date },
    end: { date: nextDay(input.date) },
  };

  const deterministicId = planEventId(planId);
  if (!existingEventId) body.id = deterministicId;

  const url = existingEventId ? `${EVENTS_URL}/${existingEventId}` : EVENTS_URL;
  const res = await fetch(url, {
    method: existingEventId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });

  if (!_retried && res.status === 409 && !existingEventId) {
    // Lost a race with another sync attempt for this same plan — the event
    // already exists under our deterministic id. Not an error: switch to
    // updating it so this call's data still lands, and the caller still
    // gets an id back to persist either way.
    return upsertCalendarEvent(refreshToken, deterministicId, planId, input, true);
  }

  if (!_retried && res.status === 404 && existingEventId) {
    // The stored google_event_id doesn't exist on Google's side anymore —
    // most likely deleted by hand (e.g. while cleaning up a duplicate, or
    // just tidying the calendar). Without this, the plan would be silently
    // desynced forever: every future edit keeps trying to PATCH an event
    // that's gone and keeps failing quietly. Recreate it instead, so
    // editing a plan always results in a live, correct calendar entry
    // regardless of what happened to the old one.
    return upsertCalendarEvent(refreshToken, null, planId, input, true);
  }

  if (!res.ok) {
    throw new Error(`Google Calendar event ${existingEventId ? "update" : "create"} failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.id as string;
}

export async function deleteCalendarEvent(refreshToken: string, eventId: string): Promise<void> {
  const accessToken = await getAccessToken(refreshToken);
  const res = await fetch(`${EVENTS_URL}/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404/410 means it's already gone from the calendar — fine, that's the
  // end state we wanted anyway.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar event delete failed: ${res.status} ${await res.text()}`);
  }
}

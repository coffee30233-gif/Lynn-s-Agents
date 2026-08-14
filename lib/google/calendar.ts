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

/**
 * Creates the plan's event on first sync, or patches the same event on
 * every later sync (existingEventId comes from plans.google_event_id) so
 * re-clicking "加入 Google 行事曆" after editing a plan updates it in place
 * instead of creating a duplicate.
 */
export async function upsertCalendarEvent(
  refreshToken: string,
  existingEventId: string | null,
  input: CalendarEventInput
): Promise<string> {
  const accessToken = await getAccessToken(refreshToken);

  const body = {
    summary: input.title,
    location: input.location || undefined,
    description: input.description || undefined,
    start: { date: input.date },
    end: { date: nextDay(input.date) },
  };

  const url = existingEventId ? `${EVENTS_URL}/${existingEventId}` : EVENTS_URL;
  const res = await fetch(url, {
    method: existingEventId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
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

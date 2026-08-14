import "server-only";
import type { ParsedExpense } from "@/lib/text/parseExpense";

/**
 * Writes to the user's own separate passbook app (my-passbook-app.vercel.app,
 * a different repo/deployment — not part of this project). Direct
 * server-to-server call, no n8n involved: n8n only fronts Gemini for chat
 * replies, it has no role in writing to a third app's API, and adding one
 * here would just split this logic across two systems for no benefit —
 * same reasoning as the Google Calendar integration (lib/google/calendar.ts).
 */

export interface PassbookWriteResult {
  ok: boolean;
  error?: string;
}

export async function writeExpenseToPassbook(expense: ParsedExpense): Promise<PassbookWriteResult> {
  const baseUrl = process.env.PASSBOOK_API_URL;
  const secret = process.env.PASSBOOK_API_SECRET;
  if (!baseUrl || !secret) {
    return { ok: false, error: "PASSBOOK_API_URL/PASSBOOK_API_SECRET not configured" };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Secret": secret },
      body: JSON.stringify({
        date: expense.date,
        type: expense.type,
        category: expense.category,
        amount: expense.amount,
        accountId: expense.accountId,
        note: expense.note || undefined,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `passbook API ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[passbook] write failed:", err);
    return { ok: false, error: "Failed to reach passbook API" };
  }
}

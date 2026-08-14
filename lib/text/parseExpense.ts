export interface ParsedExpense {
  amount: number;
  type: "expense" | "income";
  category: string;
  accountId: string;
  date: string; // "YYYY-MM-DD"
  note: string;
}

const BLOCK_SPLIT = /^💰\s*記帳\s*$/m;
const FIELD_LINE = /^[・\-]?\s*(金額|類型|分類|帳戶|日期|備註)\s*[:：]\s*(.+)$/;

/**
 * Pulls 💰 記帳 blocks out of the 管帳助理's reply — same idea as
 * parseItinerary.ts's marker-based sections, one marker instead of several.
 * Supports more than one block per reply in case the user mentioned
 * multiple expenses in one message.
 */
export function parseExpenses(content: string): ParsedExpense[] {
  const blocks = content.split(BLOCK_SPLIT).slice(1);
  const results: ParsedExpense[] = [];

  for (const block of blocks) {
    const fields: Record<string, string> = {};
    for (const line of block.split("\n")) {
      const match = line.match(FIELD_LINE);
      if (match) fields[match[1]] = match[2].trim();
    }

    const amount = parseFloat((fields["金額"] ?? "").replace(/[^\d.]/g, ""));
    const type: "expense" | "income" = fields["類型"] === "income" ? "income" : "expense";
    const category = fields["分類"] || (type === "income" ? "otherIncome" : "other");
    const accountId = fields["帳戶"] || "cash";
    const date = fields["日期"] ?? "";
    const note = fields["備註"] ?? "";

    if (amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      results.push({ amount, type, category, accountId, date, note });
    }
  }

  return results;
}

const BLOCK_REGEX = /^💰\s*記帳\s*\n(?:[・\-]?\s*(?:金額|類型|分類|帳戶|日期|備註)\s*[:：].*\n?){1,10}/gm;

/**
 * Drops 💰 記帳 blocks from what's actually shown in the chat bubble — they
 * exist for parseExpenses() to read, not for the user to read raw key/value
 * lines. Removes just the block itself (marker + its field lines), keeping
 * any natural-language confirmation before and after it intact.
 */
export function stripExpenseBlocks(content: string): string {
  return content.replace(BLOCK_REGEX, "").trim();
}

import Image from "next/image";
import type { ChatMessage, CharacterProfile } from "@/types";
import { SourceLinks } from "./SourceLinks";
import { SavePlanButton } from "./SavePlanButton";
import { stripMarkdown } from "@/lib/text/stripMarkdown";
import { findDateInconsistencies } from "@/lib/text/verifyDates";
import { stripExpenseBlocks } from "@/lib/text/parseExpense";

export function ChatBubble({
  message,
  character,
  conversationId,
}: {
  message: ChatMessage;
  character: CharacterProfile;
  conversationId?: string;
}) {
  const isUser = message.role === "user";
  const rawContent = isUser ? message.content : stripMarkdown(message.content);
  const content =
    !isUser && character.id === "expense-tracker" ? stripExpenseBlocks(rawContent) : rawContent;

  // Prompting the model not to fabricate time-sensitive info (weather, road
  // closures, transit changes) turned out not to be reliable — it kept
  // stating specific numbers with no search behind them. This is the
  // deterministic backstop: no sources on a 實用資訊 reply means nothing was
  // actually verified, whatever the text sounds like.
  const isUnverifiedPracticalInfo =
    !isUser &&
    character.id === "event-planner" &&
    content.includes("實用資訊") &&
    (!message.sources || message.sources.length === 0);

  // Same idea, narrower and fully deterministic: if the reply states both a
  // date and a weekday, check them against a real calendar rather than
  // trusting the model got the pairing right.
  const dateIssues = isUser ? [] : findDateInconsistencies(content);

  return (
    <div className={`flex animate-fade-in items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && (
        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15">
          <Image src={character.avatar} alt={character.displayName} fill className="object-cover" />
        </div>
      )}
      <div className={`max-w-[80%] sm:max-w-[70%] ${isUser ? "flex flex-col items-end" : ""}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
            isUser
              ? "rounded-br-sm bg-white text-ink-950"
              : "rounded-bl-sm border border-white/10 bg-white/[0.05] text-white/90"
          }`}
        >
          {content}
        </div>
        {!isUser && (
          <>
            {isUnverifiedPracticalInfo && (
              <p className="mt-1.5 text-xs text-amber-300/80">
                ⚠️ 這則回覆沒有搜尋來源佐證，天氣／交通等資訊可能不準確，請自行查證後再行動。
              </p>
            )}
            {dateIssues.length > 0 && (
              <div className="mt-1.5 text-xs text-red-300/90">
                {dateIssues.map((issue, i) => (
                  <p key={i}>
                    ⚠️ 「{issue.raw}」日期與星期對不上——{issue.raw.split(/[（(]/)[0]}實際上是{issue.actualWeekday}，不是{issue.statedWeekday}。
                  </p>
                ))}
              </div>
            )}
            <SourceLinks sources={message.sources} />
            {character.id === "event-planner" && (
              <SavePlanButton content={content} sources={message.sources} conversationId={conversationId} />
            )}
            {message.expenseSync && message.expenseSync.saved > 0 && (
              <p className="mt-1.5 text-xs text-emerald-300/80">
                ✓ 已記入管帳 App（{message.expenseSync.saved} 筆）
              </p>
            )}
            {message.expenseSync && message.expenseSync.failed > 0 && (
              <p className="mt-1.5 text-xs text-red-300/90">
                ⚠️ {message.expenseSync.failed} 筆記帳同步失敗，請確認管帳 App 是否正常
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ThinkingBubble({ character }: { character: CharacterProfile }) {
  return (
    <div className="flex animate-fade-in items-end gap-2">
      <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15">
        <Image src={character.avatar} alt={character.displayName} fill className="object-cover" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.05] px-4 py-3">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white/50 [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white/50 [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white/50" />
      </div>
    </div>
  );
}

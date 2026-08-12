"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatResponseBody, CharacterProfile } from "@/types";
import { ChatHeader } from "./ChatHeader";
import { ChatBubble, ThinkingBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";

function makeId() {
  return Math.random().toString(36).slice(2);
}

export function ChatView({
  character,
  initialMessages,
  initialConversationId,
}: {
  character: CharacterProfile;
  initialMessages?: ChatMessage[];
  initialConversationId?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages && initialMessages.length > 0
      ? initialMessages
      : [
          {
            id: makeId(),
            role: "assistant",
            content: "What problem are you trying to solve?",
            createdAt: Date.now(),
          },
        ]
  );
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSentTextRef = useRef<string>("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function sendText(text: string) {
    lastSentTextRef.current = text;
    setStatus("sending");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          message: text,
          conversationId,
          mode: "chat",
        }),
      });

      if (!res.ok) throw new Error(`Request failed with ${res.status}`);

      const data: ChatResponseBody = await res.json();
      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", content: data.message, createdAt: Date.now() },
      ]);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || status === "sending") return;

    setMessages((prev) => [...prev, { id: makeId(), role: "user", content: text, createdAt: Date.now() }]);
    setInput("");
    void sendText(text);
  }

  function handleRetry() {
    if (lastSentTextRef.current) void sendText(lastSentTextRef.current);
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink-950">
      <ChatHeader character={character} />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} character={character} />
        ))}

        {status === "sending" && <ThinkingBubble character={character} />}

        {status === "error" && (
          <div className="flex items-center gap-2 self-start rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            <span>訊息傳送失敗，請再試一次 · Something went wrong.</span>
            <button
              type="button"
              onClick={handleRetry}
              className="font-medium underline underline-offset-2 hover:text-red-200"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 border-t border-white/10 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <ChatInput value={input} onChange={setInput} onSend={handleSend} disabled={status === "sending"} />
        </div>
      </div>
    </div>
  );
}

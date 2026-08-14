export type AgentMode = "chat" | "think" | "plan" | "learn" | "do";

export interface VoiceConfig {
  enabled: boolean;
  provider: string | null;
  voiceId: string | null;
}

export interface MemoryConfig {
  enabled: boolean;
}

export interface CharacterProfile {
  id: string;
  name: string;
  displayName: string;
  category: string;
  description: string;
  avatar: string;
  skillPath: string;
  enabled: boolean;
  modes: AgentMode[];
  voice: VoiceConfig;
  tools: string[];
  memory: MemoryConfig;
}

export interface Source {
  title: string;
  uri: string;
}

/** Result of trying to write parsed 💰 記帳 blocks to the passbook app —
 * only ever set on a message right after it's sent (see ChatView.tsx),
 * never persisted or reloaded from history; it's a one-time confirmation,
 * not a durable property of the message. */
export interface ExpenseSyncResult {
  saved: number;
  failed: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  sources?: Source[];
  expenseSync?: ExpenseSyncResult;
}

export interface ChatRequestBody {
  characterId: string;
  message: string;
  conversationId?: string;
  mode?: AgentMode;
}

export interface ChatResponseBody {
  characterId: string;
  message: string;
  conversationId: string;
  sources?: Source[];
  expenseSync?: ExpenseSyncResult;
}

export interface ChatErrorBody {
  error: string;
}

export interface CouncilRequestBody {
  characterIds: string[];
  message: string;
}

export interface CouncilResponse {
  characterId: string;
  displayName: string;
  message: string;
  sources?: Source[];
}

export interface CouncilResponseBody {
  conversationId: string;
  responses: CouncilResponse[];
  synthesis: string;
}

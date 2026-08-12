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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  sources?: Source[];
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

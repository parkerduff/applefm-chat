export type AppState = "CONNECTING" | "CHAT" | "SETUP";

export interface Message {
  role: "user" | "assistant";
  content: string;
  filtered?: boolean;
}

export interface HealthResponse {
  status: string;
  model: string;
  available: boolean;
}

export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }[];
}

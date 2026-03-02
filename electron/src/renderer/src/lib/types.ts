export interface Message {
  role: "user" | "assistant";
  content: string;
  filtered?: boolean;
  dbId?: number;
}

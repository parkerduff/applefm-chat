export interface ConversationRow {
  id: string;
  title: string;
  pinned: number;
  archived: number;
  branch_source_id: string | null;
  branch_source_title: string | null;
  branch_message_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  filtered: number;
  created_at: string;
}

export interface ElectronAPI {
  checkCompatibility: () => Promise<{ compatible: boolean; reasonCode?: string }>;
  generate: (params: { input: string }) => Promise<{ ok: boolean; text?: string; error?: { code: string; detail: string } }>;
  cancel: (requestId: string) => Promise<{ ok: boolean }>;
  streamStart: (requestId: string, params: { input: string }) => void;
  onStreamChunk: (requestId: string, cb: (delta: string) => void) => () => void;
  onStreamDone: (requestId: string, cb: (text: string) => void) => () => void;
  onStreamError: (requestId: string, cb: (err: string) => void) => () => void;
  // DB
  createConversation: (id: string, title?: string) => Promise<ConversationRow>;
  listConversations: (archived?: boolean) => Promise<ConversationRow[]>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  pinConversation: (id: string, pinned: boolean) => Promise<void>;
  archiveConversation: (id: string, archived: boolean) => Promise<void>;
  setBranchInfo: (id: string, sourceId: string, sourceTitle: string, messageCount: number) => Promise<void>;
  addMessage: (conversationId: string, role: string, content: string, filtered: boolean) => Promise<MessageRow>;
  getMessages: (conversationId: string) => Promise<MessageRow[]>;
  updateMessage: (id: number, content: string, filtered: boolean) => Promise<void>;
  // Share
  saveMarkdown: (markdown: string, title: string) => Promise<{ saved: boolean; path?: string }>;
  nativeShare: (markdown: string, title: string, x?: number, y?: number) => Promise<{ shared: boolean }>;
  // Menu events
  onMenuNewChat: (cb: () => void) => () => void;
  onMenuNewTemporaryChat: (cb: () => void) => () => void;
  // Update
  checkForUpdate: () => Promise<{ updateAvailable: boolean; currentVersion?: string; latestVersion?: string; downloadUrl?: string; releaseUrl?: string }>;
  getVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

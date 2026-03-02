import { contextBridge, ipcRenderer } from "electron";

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

const api: ElectronAPI = {
  checkCompatibility: () => ipcRenderer.invoke("llm:check"),
  generate: (params) => ipcRenderer.invoke("llm:generate", params),
  cancel: (requestId) => ipcRenderer.invoke("llm:cancel", requestId),

  streamStart: (requestId, params) => ipcRenderer.send("llm:stream-start", requestId, params),

  onStreamChunk: (requestId, cb) => {
    const channel = `llm:stream-chunk:${requestId}`;
    const handler = (_e: Electron.IpcRendererEvent, delta: string) => cb(delta);
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.removeListener(channel, handler); };
  },
  onStreamDone: (requestId, cb) => {
    const channel = `llm:stream-done:${requestId}`;
    const handler = (_e: Electron.IpcRendererEvent, text: string) => cb(text);
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.removeListener(channel, handler); };
  },
  onStreamError: (requestId, cb) => {
    const channel = `llm:stream-error:${requestId}`;
    const handler = (_e: Electron.IpcRendererEvent, err: string) => cb(err);
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.removeListener(channel, handler); };
  },

  // DB
  createConversation: (id, title?) => ipcRenderer.invoke("db:createConversation", id, title),
  listConversations: (archived?) => ipcRenderer.invoke("db:listConversations", archived),
  renameConversation: (id, title) => ipcRenderer.invoke("db:renameConversation", id, title),
  deleteConversation: (id) => ipcRenderer.invoke("db:deleteConversation", id),
  pinConversation: (id, pinned) => ipcRenderer.invoke("db:pinConversation", id, pinned),
  archiveConversation: (id, archived) => ipcRenderer.invoke("db:archiveConversation", id, archived),
  setBranchInfo: (id, sourceId, sourceTitle, messageCount) => ipcRenderer.invoke("db:setBranchInfo", id, sourceId, sourceTitle, messageCount),
  addMessage: (conversationId, role, content, filtered) => ipcRenderer.invoke("db:addMessage", conversationId, role, content, filtered),
  getMessages: (conversationId) => ipcRenderer.invoke("db:getMessages", conversationId),
  updateMessage: (id, content, filtered) => ipcRenderer.invoke("db:updateMessage", id, content, filtered),
  // Share
  saveMarkdown: (markdown, title) => ipcRenderer.invoke("share:saveMarkdown", markdown, title),
  nativeShare: (markdown, title, x?, y?) => ipcRenderer.invoke("share:native", markdown, title, x, y),
  // Menu events
  onMenuNewChat: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("menu:new-chat", handler);
    return () => { ipcRenderer.removeListener("menu:new-chat", handler); };
  },
  onMenuNewTemporaryChat: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("menu:new-temporary-chat", handler);
    return () => { ipcRenderer.removeListener("menu:new-temporary-chat", handler); };
  },
  // Update
  checkForUpdate: () => ipcRenderer.invoke("app:checkForUpdate"),
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
};

contextBridge.exposeInMainWorld("electronAPI", api);

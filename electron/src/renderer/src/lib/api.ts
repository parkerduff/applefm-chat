const api = window.electronAPI;

export async function checkCompatibility() {
  return api.checkCompatibility();
}

// --- DB helpers ---

export function createConversation(id: string, title?: string) {
  return api.createConversation(id, title);
}

export function listConversations(archived?: boolean) {
  return api.listConversations(archived);
}

export function renameConversation(id: string, title: string) {
  return api.renameConversation(id, title);
}

export function deleteConversation(id: string) {
  return api.deleteConversation(id);
}

export function pinConversation(id: string, pinned: boolean) {
  return api.pinConversation(id, pinned);
}

export function archiveConversation(id: string, archived: boolean) {
  return api.archiveConversation(id, archived);
}

export function addMessage(conversationId: string, role: string, content: string, filtered: boolean) {
  return api.addMessage(conversationId, role, content, filtered);
}

export function getMessages(conversationId: string) {
  return api.getMessages(conversationId);
}

export function updateMessage(id: number, content: string, filtered: boolean) {
  return api.updateMessage(id, content, filtered);
}

export function setBranchInfo(id: string, sourceId: string, sourceTitle: string, messageCount: number) {
  return api.setBranchInfo(id, sourceId, sourceTitle, messageCount);
}

export function cancelStream(requestId: string) {
  return api.cancel(requestId);
}

// --- Share helpers ---

export function saveMarkdown(markdown: string, title: string) {
  return api.saveMarkdown(markdown, title);
}

export function nativeShare(markdown: string, title: string, x?: number, y?: number) {
  return api.nativeShare(markdown, title, x, y);
}

// --- Menu event listeners ---

export function onMenuNewChat(cb: () => void) {
  return api.onMenuNewChat(cb);
}

export function onMenuNewTemporaryChat(cb: () => void) {
  return api.onMenuNewTemporaryChat(cb);
}

// --- Update helpers ---

export function checkForUpdate() {
  return api.checkForUpdate();
}

export function getVersion() {
  return api.getVersion();
}

export function openExternal(url: string) {
  return api.openExternal(url);
}

/**
 * Start a streaming generation. Returns an object with:
 * - cleanup: unsubscribe listeners
 * - requestId: ID for cancelling via api.cancel()
 */
export function streamGenerate(
  prompt: string,
  onChunk: (delta: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: string) => void,
): { cleanup: () => void; requestId: string } {
  const requestId = crypto.randomUUID();
  let cleaned = false;

  const removeChunk = api.onStreamChunk(requestId, onChunk);
  const removeDone = api.onStreamDone(requestId, (text) => {
    cleanup();
    onDone(text);
  });
  const removeError = api.onStreamError(requestId, (err) => {
    cleanup();
    onError(err);
  });

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    removeChunk();
    removeDone();
    removeError();
  }

  api.streamStart(requestId, { input: prompt });

  return { cleanup, requestId };
}

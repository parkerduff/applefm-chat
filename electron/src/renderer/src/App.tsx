import { useState, useEffect, useCallback, useRef } from "react";
import { PanelLeft, SquarePen, Download, Upload, ArrowUpCircle } from "lucide-react";
import { ChatScreen } from "@/components/chat-screen";
import { Sidebar, type Conversation } from "@/components/sidebar";
import { AdvancedSettingsButton } from "@/components/advanced-settings";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  checkCompatibility,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  pinConversation,
  archiveConversation,
  getMessages,
  addMessage,
  setBranchInfo,
  saveMarkdown,
  nativeShare,
  onMenuNewChat,
  onMenuNewTemporaryChat,
  checkForUpdate,
  openExternal,
} from "@/lib/api";
import { useAdvancedSettings } from "@/lib/settings";

type AppState = "CHECKING" | "READY" | "UNAVAILABLE";

function generateId(): string {
  return crypto.randomUUID();
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("CHECKING");
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isTemporaryChat, setIsTemporaryChat] = useState(false);
  const [showTempConfirm, setShowTempConfirm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; downloadUrl: string } | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const draftsRef = useRef<Map<string, string>>(new Map());
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const { settings, setSettings, toggleEnabled, getEffectiveSystemPrompt, getEffectiveRefusalPrefixes } = useAdvancedSettings();

  // Check for updates on mount
  useEffect(() => {
    checkForUpdate().then((info) => {
      if (info.updateAvailable && info.latestVersion && info.downloadUrl) {
        setUpdateInfo({ latestVersion: info.latestVersion, downloadUrl: info.downloadUrl });
      }
    });
  }, []);

  const guardTempChat = useCallback((action: () => void) => {
    if (isTemporaryChat) {
      pendingActionRef.current = action;
      setShowTempConfirm(true);
    } else {
      action();
    }
  }, [isTemporaryChat]);

  const confirmLeaveTempChat = useCallback(() => {
    setIsTemporaryChat(false);
    setShowTempConfirm(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  }, []);

  const cancelLeaveTempChat = useCallback(() => {
    setShowTempConfirm(false);
    pendingActionRef.current = null;
  }, []);

  const loadConversations = useCallback(async (archived: boolean) => {
    const convs = await listConversations(archived);
    setConversations(convs);
    return convs;
  }, []);

  useEffect(() => {
    checkCompatibility().then((result) => {
      if (result.compatible) {
        setAppState("READY");
        loadConversations(false).then((convs) => {
          if (convs.length > 0) setActiveId(convs[0].id);
        });
      } else {
        setAppState("UNAVAILABLE");
        setReasonCode(result.reasonCode ?? "UNKNOWN");
      }
    });
  }, [loadConversations]);

  const savedActiveIdRef = useRef<string | null>(null);

  const handleToggleArchived = useCallback(() => {
    guardTempChat(async () => {
      const next = !showArchived;
      if (next) {
        savedActiveIdRef.current = activeId;
        setActiveId(null);
      } else {
        setActiveId(savedActiveIdRef.current);
      }
      setShowArchived(next);
      await loadConversations(next);
    });
  }, [showArchived, activeId, loadConversations, guardTempChat]);

  const handleNewConversation = useCallback(() => {
    guardTempChat(async () => {
      if (showArchived) {
        setShowArchived(false);
        await loadConversations(false);
      }
      setIsTemporaryChat(false);
      // Read current values from refs to avoid stale closure captures
      const currentConversations = conversationsRef.current;
      const currentActiveId = activeIdRef.current;
      const active = currentConversations.find((c) => c.id === currentActiveId);
      const draft = currentActiveId ? (draftsRef.current.get(currentActiveId) ?? "") : "";
      if (active && active.title === "New Chat" && !draft.trim()) {
        chatInputRef.current?.focus();
        return;
      }
      const id = generateId();
      const conv = await createConversation(id);
      setConversations((prev) => [conv, ...prev]);
      setActiveId(id);
    });
  }, [showArchived, loadConversations, guardTempChat]);

  const handleNewTemporaryChat = useCallback(() => {
    if (isTemporaryChat) {
      guardTempChat(() => {
        setIsTemporaryChat(false);
        const current = conversationsRef.current;
        setActiveId(current.length > 0 ? current[0].id : null);
      });
    } else {
      setIsTemporaryChat(true);
      setActiveId(`temp-${generateId()}`);
    }
  }, [isTemporaryChat, guardTempChat]);

  const handleSelectConversation = useCallback((id: string) => {
    guardTempChat(() => {
      setIsTemporaryChat(false);
      setActiveId(id);
    });
  }, [guardTempChat]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeIdRef.current === id) {
      const remaining = conversationsRef.current.filter((c) => c.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  }, []);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    await renameConversation(id, title);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  }, []);

  const handlePinConversation = useCallback(async (id: string, pinned: boolean) => {
    await pinConversation(id, pinned);
    setConversations((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, pinned: pinned ? 1 : 0 } : c));
      // Re-sort: pinned first, then by updated_at desc
      return updated.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        return b.updated_at.localeCompare(a.updated_at);
      });
    });
  }, []);

  const handleArchiveConversation = useCallback(async (id: string, archived: boolean) => {
    await archiveConversation(id, archived);
    // Remove from current list since it moved to the other view
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeIdRef.current === id) {
      const remaining = conversationsRef.current.filter((c) => c.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  }, []);

  const handleFirstMessage = useCallback(async (conversationId: string, firstMessage: string) => {
    await renameConversation(conversationId, firstMessage);
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, title: firstMessage } : c))
    );
  }, []);

  const getActiveTitle = useCallback(() => {
    if (isTemporaryChat) return "Temporary Chat";
    const conv = conversations.find((c) => c.id === activeId);
    return conv?.title ?? "Conversation";
  }, [conversations, activeId, isTemporaryChat]);

  const handleBranchChat = useCallback(async (branchedMessages: { role: "user" | "assistant"; content: string }[]) => {
    if (!activeId) return;
    const isTempSource = isTemporaryChat;
    const sourceId = isTempSource ? null : activeId;
    const sourceTitle = isTempSource ? "Temporary Chat" : getActiveTitle();
    if (showArchived) {
      setShowArchived(false);
      await loadConversations(false);
    }
    setIsTemporaryChat(false);
    const id = generateId();
    const firstMsg = branchedMessages.find((m) => m.role === "user")?.content ?? "Branched chat";
    const title = firstMsg.length > 40 ? firstMsg.slice(0, 40) + "…" : firstMsg;
    const conv = await createConversation(id, title);
    for (const m of branchedMessages) {
      await addMessage(id, m.role, m.content, false);
    }
    const updatedConv = { ...conv, branch_source_id: sourceId, branch_source_title: sourceTitle, branch_message_count: branchedMessages.length };
    setConversations((prev) => [updatedConv, ...prev]);
    setActiveId(id);
    if (sourceId) {
      setBranchInfo(id, sourceId, sourceTitle, branchedMessages.length).catch(() => {});
    }
  }, [activeId, isTemporaryChat, showArchived, loadConversations, getActiveTitle]);

  // Wire up native menu keyboard shortcuts
  useEffect(() => {
    const removeNewChat = onMenuNewChat(() => handleNewConversation());
    const removeNewTemp = onMenuNewTemporaryChat(() => handleNewTemporaryChat());
    return () => { removeNewChat(); removeNewTemp(); };
  }, [handleNewConversation, handleNewTemporaryChat]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const buildMarkdown = useCallback(async () => {
    if (!activeId) return "";
    const title = getActiveTitle();
    const msgs = isTemporaryChat ? [] : await getMessages(activeId);
    if (msgs.length === 0) return "";
    let md = `# ${title}\n\n`;
    for (const m of msgs) {
      md += `**${m.role === "user" ? "You" : "Assistant"}:**\n${m.content}\n\n`;
    }
    return md;
  }, [activeId, getActiveTitle, isTemporaryChat]);

  const handleDownloadMd = useCallback(async () => {
    const md = await buildMarkdown();
    if (md) await saveMarkdown(md, getActiveTitle());
  }, [buildMarkdown, getActiveTitle]);

  const handleNativeShare = useCallback(async () => {
    const rect = shareRef.current?.getBoundingClientRect();
    const md = await buildMarkdown();
    if (md) {
      const x = rect ? rect.left + rect.width / 2 : undefined;
      const y = rect ? rect.bottom : undefined;
      await nativeShare(md, getActiveTitle(), x, y);
    }
  }, [buildMarkdown, getActiveTitle]);


  if (appState === "CHECKING") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          Connecting to on-device model...
        </div>
      </div>
    );
  }

  if (appState === "UNAVAILABLE") {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">ChatFM</h1>
          <div className="rounded-lg border p-6 space-y-3">
            <p className="text-lg font-medium text-destructive">Model Unavailable</p>
            <p className="text-sm text-muted-foreground">
              {reasonCode === "NOT_DARWIN" && "This app requires macOS."}
              {reasonCode === "UNSUPPORTED_HARDWARE" && "Apple Silicon (M series) is required."}
              {reasonCode === "AI_DISABLED" && "Enable Apple Intelligence in System Settings."}
              {reasonCode === "MODEL_NOT_READY" && "The on-device model is not ready yet. Try again shortly."}
              {!["NOT_DARWIN", "UNSUPPORTED_HARDWARE", "AI_DISABLED", "MODEL_NOT_READY"].includes(reasonCode ?? "") &&
                `Could not connect to the on-device model (${reasonCode}).`}
            </p>
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">Requirements:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>macOS 26+ with Apple Intelligence enabled</li>
                <li>Apple Silicon (M series)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={isTemporaryChat ? null : activeId}
        showArchived={showArchived}
        isTemporaryChat={isTemporaryChat}
        collapsed={sidebarCollapsed}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onNewTemporary={handleNewTemporaryChat}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        onPin={handlePinConversation}
        onArchive={handleArchiveConversation}
        onToggleArchived={handleToggleArchived}
        onToggleCollapse={toggleSidebar}
      />

      <div className="relative flex flex-1 flex-col min-w-0">
        {/* Content header — title and actions */}
        <div
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-between h-12 px-4 backdrop-blur-md bg-background/60"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="flex items-center gap-1">
            {/* Spacer to clear the floating toggle/new-chat buttons above */}
            <div className={sidebarCollapsed ? "w-[156px] shrink-0" : "w-[80px] shrink-0"} />
            <span className="text-sm font-medium ml-1 text-muted-foreground">{getActiveTitle()}</span>
          </div>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {updateInfo && (
              <Tooltip label={`Update to v${updateInfo.latestVersion}`}>
                <button
                  onClick={() => openExternal(updateInfo.downloadUrl)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer mr-1"
                >
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                  Update
                </button>
              </Tooltip>
            )}
            {activeId && !isTemporaryChat && (
              <>
                <Tooltip label="Share">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 cursor-pointer hover:bg-foreground/10"
                    onClick={handleNativeShare}
                    ref={shareRef}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip label="Save as Markdown">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 cursor-pointer hover:bg-foreground/10"
                    onClick={handleDownloadMd}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </>
            )}
            <AdvancedSettingsButton onClick={() => setSettingsOpen(!settingsOpen)} isOpen={settingsOpen} />
          </div>
        </div>

        {isTemporaryChat && (
          <div className="shrink-0 mt-12 flex items-center justify-between gap-2 bg-orange-500/10 px-4 py-1.5 text-xs text-orange-600 dark:text-orange-400">
            <span>Temporary chat — this conversation won't be saved to your history.</span>
            <button
              className="rounded px-2 py-0.5 text-xs font-medium hover:bg-orange-500/20 transition-colors"
              onClick={handleNewTemporaryChat}
            >
              End
            </button>
          </div>
        )}

        <main className={`min-h-0 flex-1 ${!isTemporaryChat ? "pt-12" : ""}`}>
          {activeId ? (
            <ChatScreen
              key={activeId}
              conversationId={activeId}
              isTemporary={isTemporaryChat}
              getEffectiveSystemPrompt={getEffectiveSystemPrompt}
              getEffectiveRefusalPrefixes={getEffectiveRefusalPrefixes}
              settingsOpen={settingsOpen}
              settings={settings}
              onToggleSettings={toggleEnabled}
              onSettingsChange={setSettings}
              onFirstMessage={handleFirstMessage}
              initialDraft={draftsRef.current.get(activeId) ?? ""}
              onDraftChange={(draft) => { if (activeId) draftsRef.current.set(activeId, draft); }}
              chatInputRef={chatInputRef}
              onBranchChat={handleBranchChat}
              branchedFrom={conversations.find((c) => c.id === activeId)?.branch_source_title ?? undefined}
              branchMessageCount={conversations.find((c) => c.id === activeId)?.branch_message_count ?? undefined}
              onNavigateToConversation={(id) => {
                if (conversations.some((c) => c.id === id)) setActiveId(id);
              }}
              branchSourceId={conversations.find((c) => c.id === activeId)?.branch_source_id ?? undefined}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">No conversation selected</p>
                <p className="text-sm">Create a new chat to get started.</p>
              </div>
            </div>
          )}
        </main>

        {showTempConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-sm rounded-xl border bg-background p-6 shadow-lg space-y-4">
              <h2 className="text-base font-semibold">Leave temporary chat?</h2>
              <p className="text-sm text-muted-foreground">
                This conversation isn't saved. If you leave now, it will be gone forever.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-md px-4 py-2 text-sm font-medium border hover:bg-accent transition-colors"
                  onClick={cancelLeaveTempChat}
                >
                  Stay
                </button>
                <button
                  className="rounded-md px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2 focus:ring-offset-background"
                  onClick={confirmLeaveTempChat}
                  autoFocus
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}



      </div>

      {/* Floating buttons — overlays everything including sidebar */}
      <div
        className="absolute top-0 left-0 z-30 flex items-center gap-1 h-12 pl-[76px] pointer-events-none"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 pointer-events-auto cursor-pointer hover:bg-foreground/10"
          onClick={toggleSidebar}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 pointer-events-auto cursor-pointer hover:bg-foreground/10"
          onClick={handleNewConversation}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <SquarePen className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

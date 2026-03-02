import { useState, useRef, useEffect, useCallback } from "react";
import { Check, X, Pin, Archive, Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { getVersion } from "@/lib/api";

export interface Conversation {
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

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  showArchived: boolean;
  isTemporaryChat: boolean;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewTemporary: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onToggleArchived: () => void;
  onToggleCollapse: () => void;
}

interface ContextMenuState {
  convId: string;
  x: number;
  y: number;
}

export function Sidebar({
  conversations,
  activeId,
  showArchived,
  isTemporaryChat,
  collapsed,
  onSelect,
  onNew,
  onNewTemporary,
  onDelete,
  onRename,
  onPin,
  onArchive,
  onToggleArchived,
  onToggleCollapse,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctxMenu]);

  // Close context menu on Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, convId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ convId, x: e.clientX, y: e.clientY });
    setConfirmDeleteId(null);
    setEditingId(null);
  }, []);

  const closeMenu = () => setCtxMenu(null);

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
    setConfirmDeleteId(null);
    closeMenu();
  };

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleDeleteClick = (id: string) => {
    setConfirmDeleteId(id);
    setEditingId(null);
    closeMenu();
  };

  const confirmDelete = (id: string) => {
    onDelete(id);
    setConfirmDeleteId(null);
  };

  const cancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const getConv = (id: string) => conversations.find((c) => c.id === id);

  if (collapsed) return null;

  return (
    <div className="relative flex h-full w-64 flex-col border-r bg-muted/30">
      {/* Floating toolbar — overlays content in the titlebar zone */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-end gap-1 px-2 h-12 backdrop-blur-md bg-muted/50"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <Tooltip label="Temporary chat">
            <Button
              variant={isTemporaryChat ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 cursor-pointer hover:bg-foreground/10"
              onClick={onNewTemporary}
            >
              <Ghost className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip label={showArchived ? "Show active chats" : "Show archived chats"}>
            <Button
              variant={showArchived ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 cursor-pointer hover:bg-foreground/10"
              onClick={onToggleArchived}
            >
              <Archive className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Conversation list — padded top to sit below the floating toolbar */}
      <div className="flex-1 overflow-y-auto px-2 pt-14">
        {showArchived && (
          <div className="px-1 pb-2">
            <p className="text-xs font-medium text-muted-foreground">Archived Conversations</p>
          </div>
        )}
        <div className="space-y-1 pb-4">
          {isTemporaryChat && (
            <div
              className="flex items-center rounded-lg px-2 py-2 text-sm bg-accent text-accent-foreground"
            >
              <Ghost className="h-4 w-4 shrink-0 mr-2 text-orange-500" />
              <div className="min-w-0 flex-1">
                <span className="block truncate">Temporary Chat</span>
                <span className="block text-[10px] text-muted-foreground leading-tight">Won't be saved</span>
              </div>
            </div>
          )}
          {conversations.map((conv) => {
            // Rename mode
            if (editingId === conv.id) {
              return (
                <div key={conv.id} className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm bg-accent">
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    className="flex-1 min-w-0 bg-background rounded px-1.5 py-0.5 text-sm border border-input outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span
                    onClick={(e) => { e.stopPropagation(); commitRename(); }}
                    className="cursor-pointer p-1 rounded hover:bg-foreground/10"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); cancelRename(); }}
                    className="cursor-pointer p-1 rounded hover:bg-foreground/10"
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                </div>
              );
            }

            // Confirm delete mode
            if (confirmDeleteId === conv.id) {
              return (
                <div key={conv.id} className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm bg-destructive/10 border border-destructive/30">
                  <span className="flex-1 min-w-0 truncate text-xs">Delete?</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); confirmDelete(conv.id); }}
                    className="cursor-pointer p-1 rounded bg-destructive text-destructive-foreground text-xs px-2"
                  >
                    Yes
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); cancelDelete(); }}
                    className="cursor-pointer p-1 rounded hover:bg-foreground/10 text-xs px-2"
                  >
                    No
                  </span>
                </div>
              );
            }

            // Normal mode
            return (
              <div
                key={conv.id}
                className={`flex items-center rounded-lg px-2 py-2 text-sm cursor-pointer ${
                  activeId === conv.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => onSelect(conv.id)}
                onContextMenu={(e) => handleContextMenu(e, conv.id)}
              >
                {conv.pinned ? (
                  <Pin className="h-4 w-4 shrink-0 mr-2 text-blue-500" />
                ) : null}
                <span className="relative group/tip truncate">
                  {conv.title}
                  <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden max-w-[220px] wrap-break-word rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md border group-hover/tip:block">
                    {conv.title}
                  </span>
                </span>
                <span className="ml-auto" />
                {conv.archived ? (
                  <Tooltip label="Unarchive" side="top">
                    <span
                      onClick={(e) => { e.stopPropagation(); onArchive(conv.id, false); }}
                      className="cursor-pointer p-1 rounded hover:bg-foreground/10"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            );
          })}

          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {showArchived ? "No archived conversations" : "No conversations yet"}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 px-3 py-2 text-center text-[10px] text-muted-foreground leading-relaxed">
        {appVersion && <span>v{appVersion} · </span>}
        Powered by{" "}
        <a href="https://github.com/parkerduff/apple-local-llm" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          apple-local-llm
        </a>
        <br />
        Not affiliated with Apple Inc.
      </div>

      {/* Context menu */}
      {ctxMenu && (() => {
        const conv = getConv(ctxMenu.convId);
        if (!conv) return null;
        return (
          <div
            ref={menuRef}
            className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 170), top: Math.min(ctxMenu.y, window.innerHeight - 180) }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
              onClick={() => { onPin(conv.id, !conv.pinned); closeMenu(); }}
            >
              {conv.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
              onClick={() => startRename(conv.id, conv.title)}
            >
              Rename
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
              onClick={() => { onArchive(conv.id, !conv.archived); closeMenu(); }}
            >
              {conv.archived ? "Unarchive" : "Archive"}
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-destructive/10 text-destructive cursor-pointer"
              onClick={() => handleDeleteClick(conv.id)}
            >
              Delete
            </button>
          </div>
        );
      })()}
    </div>
  );
}

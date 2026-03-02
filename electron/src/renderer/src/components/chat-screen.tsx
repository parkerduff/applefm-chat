import React, { useState, useRef, useEffect, useCallback } from "react";
import { Copy, Check, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AdvancedSettingsPanel } from "@/components/advanced-settings";
import { streamGenerate, cancelStream, addMessage, getMessages, updateMessage } from "@/lib/api";
import { formatPrompt, processResponse } from "@/lib/apple-on-device";
import type { AdvancedSettings } from "@/lib/settings";
import type { Message } from "@/lib/types";

interface ChatScreenProps {
  conversationId: string;
  isTemporary?: boolean;
  getEffectiveSystemPrompt: () => string;
  getEffectiveRefusalPrefixes: () => string[];
  settingsOpen: boolean;
  settings: AdvancedSettings;
  onToggleSettings: (enabled: boolean) => void;
  onSettingsChange: (settings: AdvancedSettings) => void;
  onFirstMessage: (conversationId: string, firstMessage: string) => void;
  initialDraft?: string;
  onDraftChange?: (draft: string) => void;
  onBranchChat?: (messages: Message[]) => void;
  branchedFrom?: string;
  branchMessageCount?: number;
  branchSourceId?: string;
  onNavigateToConversation?: (id: string) => void;
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatScreen({
  conversationId,
  isTemporary = false,
  getEffectiveSystemPrompt,
  getEffectiveRefusalPrefixes,
  settingsOpen,
  settings,
  onToggleSettings,
  onSettingsChange,
  onFirstMessage,
  initialDraft = "",
  onDraftChange,
  onBranchChat,
  branchedFrom,
  branchMessageCount,
  branchSourceId,
  onNavigateToConversation,
  chatInputRef,
}: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialDraft);

  // Persist draft to parent whenever it changes
  useEffect(() => {
    onDraftChange?.(input);
  }, [input, onDraftChange]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const localTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = chatInputRef ?? localTextareaRef;
  const streamingRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const fullContentRef = useRef("");
  const handledRef = useRef(false);

  // Cancel active stream and remove IPC listeners on unmount
  useEffect(() => {
    return () => {
      if (requestIdRef.current) cancelStream(requestIdRef.current);
      cleanupRef.current?.();
    };
  }, []);

  // Focus textarea at end of content on mount
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
  }, []);

  // Load messages when conversation changes (skip for temporary chats)
  useEffect(() => {
    if (isTemporary) { setMessages([]); return; }
    let cancelled = false;
    setMessages([]);
    getMessages(conversationId).then((rows) => {
      if (cancelled) return;
      setMessages(
        rows.map((r) => ({
          role: r.role,
          content: r.content,
          filtered: r.filtered === 1,
          dbId: r.id,
        }))
      );
    });
    return () => { cancelled = true; };
  }, [conversationId, isTemporary]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || streamingRef.current) return;

    streamingRef.current = true;
    const userContent = input.trim();

    // If this is the first message, auto-title the conversation
    if (messages.length === 0 && !isTemporary) {
      const title = userContent.length > 40 ? userContent.slice(0, 40) + "…" : userContent;
      onFirstMessage(conversationId, title);
    }

    // Persist user message (skip for temporary chats)
    let userDbId: number | undefined;
    if (!isTemporary) {
      const userRow = await addMessage(conversationId, "user", userContent, false);
      userDbId = userRow.id;
    }
    const userMessage: Message = { role: "user", content: userContent, dbId: userDbId };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    const assistantMessage: Message = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMessage]);

    const prompt = formatPrompt(newMessages, getEffectiveSystemPrompt());
    fullContentRef.current = "";
    handledRef.current = false;

    const { cleanup, requestId } = streamGenerate(
      prompt,
      // onChunk
      (delta) => {
        fullContentRef.current += delta;
        const currentContent = fullContentRef.current;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: currentContent };
          }
          return updated;
        });
      },
      // onDone
      async (_finalText) => {
        if (handledRef.current) return;
        handledRef.current = true;
        requestIdRef.current = null;
        const processed = processResponse(fullContentRef.current, getEffectiveRefusalPrefixes());

        if (isTemporary) {
          setMessages((prev) => {
            const updated = [...prev];
            if (processed.filtered && updated.length >= 2) {
              updated[updated.length - 2] = { ...updated[updated.length - 2], filtered: true };
            }
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: processed.content, filtered: processed.filtered };
            }
            return updated;
          });
        } else {
          const assistantRow = await addMessage(conversationId, "assistant", processed.content, processed.filtered);

          if (processed.filtered) {
            // Also mark the user message as filtered
            await updateMessage(userDbId!, userContent, true);
            setMessages((prev) => {
              const updated = [...prev];
              if (updated.length >= 2) {
                updated[updated.length - 2] = { ...updated[updated.length - 2], filtered: true };
              }
              const last = updated[updated.length - 1];
              if (last.role === "assistant") {
                updated[updated.length - 1] = { ...last, content: processed.content, filtered: true, dbId: assistantRow.id };
              }
              return updated;
            });
          } else {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === "assistant") {
                updated[updated.length - 1] = { ...last, dbId: assistantRow.id };
              }
              return updated;
            });
          }
        }
        setIsStreaming(false);
        streamingRef.current = false;
        cleanupRef.current = null;
      },
      // onError
      async (err) => {
        if (handledRef.current) return;
        handledRef.current = true;
        requestIdRef.current = null;
        const errorContent = `Error: ${err}`;
        if (!isTemporary) await addMessage(conversationId, "assistant", errorContent, false);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: errorContent };
          }
          return updated;
        });
        setIsStreaming(false);
        streamingRef.current = false;
        cleanupRef.current = null;
      },
    );

    cleanupRef.current = cleanup;
    requestIdRef.current = requestId;
  };

  const handleCancel = async () => {
    // Abort the main-process stream
    if (requestIdRef.current) {
      cancelStream(requestIdRef.current);
      requestIdRef.current = null;
    }
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (handledRef.current) {
      setIsStreaming(false);
      streamingRef.current = false;
      return;
    }
    handledRef.current = true;

    const partialContent = fullContentRef.current;

    if (!partialContent) {
      // No content received yet — just remove the empty assistant bubble
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } else {
      const processed = processResponse(partialContent, getEffectiveRefusalPrefixes());
      if (!isTemporary) {
        // Persist partial assistant response to DB
        const assistantRow = await addMessage(conversationId, "assistant", processed.content, processed.filtered);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            return [...updated.slice(0, -1), { ...last, content: processed.content, filtered: processed.filtered, dbId: assistantRow.id }];
          }
          return updated;
        });
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            return [...updated.slice(0, -1), { ...last, content: processed.content, filtered: processed.filtered }];
          }
          return updated;
        });
      }
    }
    setIsStreaming(false);
    streamingRef.current = false;
  };

  return (
    <div className="flex h-full flex-col relative">
      {settingsOpen && (
        <div className="absolute inset-x-0 top-0 z-10 bg-background shadow-md max-h-[calc(100%-60px)] overflow-y-auto">
          <AdvancedSettingsPanel
            settings={settings}
            onToggle={onToggleSettings}
            onSettingsChange={onSettingsChange}
          />
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1 px-4 py-4" ref={scrollRef}>
        <div className="mx-auto max-w-3xl space-y-3 pb-4">
          {messages.length === 0 && (
            <div className="flex h-40 items-center justify-center text-center text-muted-foreground">
              <div>
                <p className="text-lg font-medium">{isTemporary ? "Temporary Chat" : "Ready to chat"}</p>
                <p className="text-sm">
                  {isTemporary
                    ? "This chat won't be saved. It will disappear when you navigate away."
                    : "Messages are processed locally on your Mac."}
                </p>
              </div>
            </div>
          )}
          {messages.map((message, i) => (
            <React.Fragment key={message.dbId ?? `pending-${i}`}>
            {branchedFrom && branchMessageCount === i && (
              <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>Branched from{" "}
                  {branchSourceId ? (
                    <button
                      className="underline hover:text-foreground transition-colors cursor-pointer"
                      onClick={() => onNavigateToConversation?.(branchSourceId)}
                    >
                      {branchedFrom}
                    </button>
                  ) : branchedFrom}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <div
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "user" ? (
                <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-muted text-foreground">
                  <span className="block whitespace-pre-wrap">{message.content}</span>
                </div>
              ) : (
                <div className="py-1">
                  {message.content ? (
                    <>
                      <span className="block whitespace-pre-wrap text-foreground">{message.content}</span>
                      <div className="flex items-center gap-0.5 mt-1 relative">
                        <button
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Copy response"
                          onClick={() => {
                            navigator.clipboard.writeText(message.content);
                            setCopiedIdx(i);
                            setTimeout(() => setCopiedIdx(null), 1500);
                          }}
                        >
                          {copiedIdx === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Branch in new chat"
                          onClick={() => onBranchChat?.(messages.slice(0, i + 1))}
                        >
                          <GitBranch className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 h-5">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground opacity-60 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground opacity-60 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground opacity-60 animate-bounce" />
                    </div>
                  )}
                </div>
              )}
            </div>
            </React.Fragment>
          ))}
          {branchedFrom && branchMessageCount != null && branchMessageCount >= messages.length && (
            <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>Branched from{" "}
                {branchSourceId ? (
                  <button
                    className="underline hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => onNavigateToConversation?.(branchSourceId)}
                  >
                    {branchedFrom}
                  </button>
                ) : branchedFrom}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              setInput(e.target.value);
              if (e.target.scrollHeight > 36) {
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !isStreaming) {
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }
            }}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 h-9 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          {isStreaming ? (
            <Button type="button" variant="destructive" onClick={handleCancel} className="rounded-full px-5">
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()} className="rounded-full px-5 bg-blue-500 hover:bg-blue-600">
              Send
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

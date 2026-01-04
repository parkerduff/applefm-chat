"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { streamGenerate, formatMessagesAsPrompt } from "@/lib/api";
import { processResponse } from "@/lib/apple-on-device";
import type { Message } from "@/lib/types";

export function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingRef = useRef(false);

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
    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    const assistantMessage: Message = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMessage]);

    abortControllerRef.current = new AbortController();

    try {
      const prompt = formatMessagesAsPrompt(newMessages);
      
      let fullContent = "";
      for await (const chunk of streamGenerate(prompt, abortControllerRef.current.signal)) {
        fullContent += chunk;
        const currentContent = fullContent;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            last.content = currentContent;
          }
          return updated;
        });
      }
      
      // Process response for guardrail detection
      const processed = processResponse(fullContent);
      if (processed.filtered) {
        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length >= 2) {
            updated[updated.length - 2].filtered = true;
          }
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            last.content = processed.content;
            last.filtered = true;
          }
          return updated;
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // User cancelled
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            last.content = "Error: Failed to get response. Is the server running?";
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      streamingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    // Remove the empty assistant message if cancelled before any content
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.content) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  };

  const handleClear = () => {
    setMessages([]);
  };

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1 p-4" ref={scrollRef}>
        <div className="mx-auto max-w-2xl space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="flex h-40 items-center justify-center text-center text-muted-foreground">
              <div>
                <p className="text-lg font-medium">Ready to chat</p>
                <p className="text-sm">Messages are processed locally on your Mac.</p>
              </div>
            </div>
          )}
          {messages.map((message, i) => (
            <div
              key={i}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] min-w-0 overflow-hidden rounded-2xl px-4 py-2 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {message.content ? (
                  <p className="whitespace-pre-wrap break-words hyphens-auto" lang="en">{message.content}</p>
                ) : (
                  <div className="flex items-center justify-center gap-1 h-5 translate-y-px">
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              setInput(e.target.value);
              // Auto-resize only when content grows beyond one line
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
            disabled={isStreaming}
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
          {messages.length > 0 && !isStreaming && (
            <Button type="button" variant="ghost" onClick={handleClear} className="rounded-full px-5 text-muted-foreground">
              Clear
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

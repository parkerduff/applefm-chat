"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SetupScreen } from "@/components/setup-screen";
import { ChatScreen } from "@/components/chat-screen";
import { AdvancedSettingsButton } from "@/components/advanced-settings";
import { checkHealth } from "@/lib/api";
import { POLL_INTERVAL_MS, SETUP_COMMAND } from "@/lib/constants";
import { useAdvancedSettings } from "@/lib/settings";
import type { AppState } from "@/lib/types";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("CONNECTING");
  const [isConnected, setIsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hasEverConnected = useRef(false);
  const { settings, setSettings, toggleEnabled, getEffectiveSystemPrompt, getEffectiveRefusalPrefixes } = useAdvancedSettings();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(SETUP_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const performHealthCheck = useCallback(async () => {
    const health = await checkHealth();
    if (health?.available) {
      setAppState("CHAT");
      setIsConnected(true);
      hasEverConnected.current = true;
      return true;
    } else {
      setIsConnected(false);
      if (!hasEverConnected.current) {
        setAppState("SETUP");
      }
      return false;
    }
  }, []);

  useEffect(() => {
    performHealthCheck();
  }, [performHealthCheck]);

  useEffect(() => {
    if (appState === "CONNECTING") return;

    const interval = setInterval(async () => {
      await performHealthCheck();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [appState, performHealthCheck]);

  if (appState === "CONNECTING") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          Connecting...
        </div>
      </div>
    );
  }

  if (appState === "SETUP") {
    return <SetupScreen isPolling={true} />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden relative">
      <header className="shrink-0 flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">applefm.chat</h1>
        <div className="flex items-center gap-3">
          <AdvancedSettingsButton onClick={() => setSettingsOpen(!settingsOpen)} isOpen={settingsOpen} />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2">
              {isConnected ? (
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              ) : (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </>
              )}
            </span>
            {isConnected ? "Connected" : "Disconnected"}
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <ChatScreen
          getEffectiveSystemPrompt={getEffectiveSystemPrompt}
          getEffectiveRefusalPrefixes={getEffectiveRefusalPrefixes}
          settingsOpen={settingsOpen}
          settings={settings}
          onToggleSettings={toggleEnabled}
          onSettingsChange={setSettings}
        />
      </main>
      <footer className="shrink-0 border-t px-4 py-2 text-center text-xs text-muted-foreground">
        Powered by{" "}
        <a href="https://github.com/parkerduff/apple-local-llm" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          apple-local-llm
        </a>
        {" · "}
        <a href="https://github.com/parkerduff/applefm-chat" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          Source
        </a>
        {" · Not affiliated with Apple Inc."}
      </footer>
      
      {!isConnected && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-xl shadow-lg p-6 max-w-xl w-full text-center space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Connection Lost</h2>
              <p className="text-sm text-muted-foreground">Restart the server to continue</p>
            </div>
            <button
              onClick={handleCopy}
              className="w-full rounded-lg bg-zinc-900 p-3 text-sm text-zinc-100 text-left overflow-x-auto cursor-pointer hover:bg-zinc-800 transition-colors group"
            >
              <code className="block">{SETUP_COMMAND}</code>
              <span className="block text-xs text-zinc-500 mt-2 group-hover:text-zinc-400">
                {copied ? "✓ Copied to clipboard" : "Click to copy"}
              </span>
            </button>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              Reconnecting...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

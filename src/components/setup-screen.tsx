"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SETUP_COMMAND } from "@/lib/constants";

interface SetupScreenProps {
  isPolling: boolean;
}

export function SetupScreen({ isPolling }: SetupScreenProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(SETUP_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">applefm.chat</h1>
          <p className="text-muted-foreground">
            A local chat interface for Apple's on-device LLM. All processing happens privately on your Mac — no data leaves your device.
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch gap-6">
          {/* Desktop app card */}
          <Card className="flex-1 min-w-0">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Download the Desktop App</CardTitle>
              <CardDescription>
                Full-featured app with conversation history, no setup required
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <a
                href="https://github.com/parkerduff/applefm-chat/releases/latest/download/ChatFM-arm64.dmg"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors p-4 text-sm font-medium text-white cursor-pointer"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 16l-6-6h4V4h4v6h4l-6 6z" /><path d="M20 18H4v2h16v-2z" /></svg>
                Download for macOS
              </a>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Includes:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Persistent conversation history</li>
                  <li>No terminal or Node.js required</li>
                  <li>Native macOS app with keyboard shortcuts</li>
                </ul>
              </div>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Requirements:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>macOS 26+ with Apple Intelligence enabled</li>
                  <li>Apple Silicon (M series)</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* "or" divider — vertical on desktop, horizontal on mobile */}
          <div className="flex md:flex-col items-center gap-3 text-sm text-muted-foreground">
            <div className="h-px flex-1 bg-border md:h-auto md:w-px md:flex-1" />
            <span className="shrink-0">or</span>
            <div className="h-px flex-1 bg-border md:h-auto md:w-px md:flex-1" />
          </div>

          {/* Browser server card */}
          <Card className="flex-1 min-w-0">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Use in the Browser</CardTitle>
              <CardDescription>
                Run this command in your terminal to connect
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                onClick={handleCopy}
                className="w-full rounded-lg bg-zinc-900 p-4 text-sm text-zinc-100 text-left overflow-x-auto cursor-pointer hover:bg-zinc-800 transition-colors group"
              >
                <code className="block">{SETUP_COMMAND}</code>
                <span className="block text-xs text-zinc-500 mt-2 group-hover:text-zinc-400">
                  {copied ? "✓ Copied to clipboard" : "Click to copy"}
                </span>
              </button>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                {isPolling ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                    </span>
                    Waiting for server...
                  </>
                ) : (
                  "Checking connection..."
                )}
              </div>

              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Requirements:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>macOS 26+ with Apple Intelligence enabled</li>
                  <li>Node.js 18+</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

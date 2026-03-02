# applefm-chat Electron App Plan

## Overview

Convert the web app into a standalone Electron desktop app. The key insight: `apple-local-llm` has a direct Node.js API (`createClient()`) that uses stdio — no HTTP server needed. The main process owns the LLM client, the renderer is your React UI, and they talk via IPC.

```
┌─────────────────────────────────────┐
│  Electron Main Process (Node.js)    │
│  ┌───────────────────────────────┐  │
│  │  apple-local-llm createClient │  │
│  │  (stdio to native fm-proxy)   │  │
│  └──────────┬────────────────────┘  │
│             │ IPC                    │
│  ┌──────────▼────────────────────┐  │
│  │  Renderer (React UI)          │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Project Location

`/Users/parkerduff/Repositories/apps/applefm-chat-electron/`

---

## 1. Project Scaffolding

**Tool:** `electron-vite` with React + TypeScript template.

```bash
npx create-electron-vite applefm-chat-electron --template react-ts
```

**Directory structure:**

```
applefm-chat-electron/
├── electron.vite.config.ts
├── package.json
├── src/
│   ├── main/          # Electron main process
│   │   └── index.ts
│   ├── preload/       # Preload scripts (contextBridge)
│   │   └── index.ts
│   └── renderer/      # React app (your UI)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   └── lib/
│       └── index.html
└── resources/         # App icon, etc.
```

**Dependencies to add:**

- `apple-local-llm` — core model client
- `@radix-ui/react-scroll-area`, `@radix-ui/react-slot` — from web app
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` — shadcn/ui stack

---

## 2. Styling Setup

- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (Vite-native, not PostCSS)
- Copy over `components/ui/` directory as-is from web app
- Copy `globals.css` with CSS variables (shadcn theme)
- Keep `components.json` for future `npx shadcn` commands

---

## 3. Main Process — `src/main/index.ts`

Owns the `apple-local-llm` client. Exposes everything via IPC.

```ts
import { app, BrowserWindow, ipcMain } from "electron";
import { createClient } from "apple-local-llm";

let client = createClient();

// 1. Compatibility check (replaces health polling)
ipcMain.handle("llm:check", async () => {
  return client.compatibility.check();
});

// 2. Non-streaming generate
ipcMain.handle("llm:generate", async (_e, params) => {
  return client.responses.create(params);
});

// 3. Streaming generate (event-based IPC)
ipcMain.on("llm:stream-start", async (event, params) => {
  try {
    for await (const chunk of client.stream(params)) {
      if ("delta" in chunk) {
        event.sender.send("llm:stream-chunk", chunk.delta);
      } else if ("done" in chunk) {
        event.sender.send("llm:stream-done", chunk.text);
      }
    }
  } catch (err: any) {
    event.sender.send("llm:stream-error", err.message);
  }
});

// 4. Cancel in-progress request
ipcMain.handle("llm:cancel", async (_e, requestId) => {
  return client.responses.cancel(requestId);
});
```

**Key differences from web app:**

- No `fetch()`, no HTTP, no SSE parsing
- `client.compatibility.check()` replaces health polling — call once on launch
- Streaming uses native IPC events (much cleaner than SSE)

---

## 4. Preload Script — `src/preload/index.ts`

Bridges main ↔ renderer safely via `contextBridge`:

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  checkCompatibility: () => ipcRenderer.invoke("llm:check"),
  generate: (params) => ipcRenderer.invoke("llm:generate", params),
  cancel: (requestId) => ipcRenderer.invoke("llm:cancel", requestId),

  streamStart: (params) => ipcRenderer.send("llm:stream-start", params),
  onStreamChunk: (cb) => {
    const handler = (_e, delta) => cb(delta);
    ipcRenderer.on("llm:stream-chunk", handler);
    return () => ipcRenderer.removeListener("llm:stream-chunk", handler);
  },
  onStreamDone: (cb) => {
    const handler = (_e, text) => cb(text);
    ipcRenderer.on("llm:stream-done", handler);
    return () => ipcRenderer.removeListener("llm:stream-done", handler);
  },
  onStreamError: (cb) => {
    const handler = (_e, err) => cb(err);
    ipcRenderer.on("llm:stream-error", handler);
    return () => ipcRenderer.removeListener("llm:stream-error", handler);
  },
});
```

Plus a `src/preload/index.d.ts` for TypeScript types in the renderer.

---

## 5. Port Renderer UI

**Files to copy from web app → `src/renderer/src/`:**

| Web app file | Action |
|---|---|
| `components/chat-screen.tsx` | Copy, remove `"use client"`, replace `streamGenerate` with IPC calls |
| `components/advanced-settings.tsx` | Copy as-is, remove `"use client"` |
| `components/setup-screen.tsx` | **Remove entirely** — no setup needed |
| `components/ui/*` | Copy as-is |
| `lib/apple-on-device.ts` | Copy as-is (prompt formatting, guardrail detection) |
| `lib/settings.ts` | Copy, remove `"use client"` |
| `lib/types.ts` | Copy, simplify (remove `HealthResponse`, `StreamChunk`, `AppState`) |
| `lib/api.ts` | **Replace entirely** with IPC wrapper |
| `lib/constants.ts` | **Remove** — no URLs/ports needed |
| `app/page.tsx` | Becomes `App.tsx` — simplified, no health polling |
| `globals.css` | Copy as-is |

---

## 6. Renderer API Layer — `src/renderer/src/lib/api.ts`

Replaces fetch-based API with IPC:

```ts
const api = window.electronAPI;

export async function checkCompatibility() {
  return api.checkCompatibility();
}

export function streamGenerate(
  prompt: string,
  onChunk: (delta: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: string) => void,
) {
  const removeChunk = api.onStreamChunk(onChunk);
  const removeDone = api.onStreamDone((text) => { cleanup(); onDone(text); });
  const removeError = api.onStreamError((err) => { cleanup(); onError(err); });

  function cleanup() {
    removeChunk();
    removeDone();
    removeError();
  }

  api.streamStart({ input: prompt });
  return cleanup; // caller can unsubscribe
}
```

**In `chat-screen.tsx`**, the streaming call changes from:

```ts
// Before (async generator over fetch/SSE):
for await (const chunk of streamGenerate(prompt, signal)) { ... }

// After (callback-based over IPC):
const cleanup = streamGenerate(prompt, onChunk, onDone, onError);
```

---

## 7. App Lifecycle

- **Single window** — standard macOS window, ~800×600 default
- **App stays alive when window closed** (macOS convention) — reopen on dock click
- **`client.shutdown()`** on `app.before-quit` to clean up the `fm-proxy` process
- Optional: tray icon for quick access (nice-to-have, not MVP)

---

## 8. Packaging & Distribution

**Tool:** `electron-builder` (comes with `electron-vite`)

```json
{
  "build": {
    "appId": "com.applefm.chat",
    "productName": "applefm chat",
    "mac": {
      "target": "dmg",
      "category": "public.app-category.productivity",
      "icon": "resources/icon.icns"
    },
    "asarUnpack": ["node_modules/apple-local-llm/**"]
  }
}
```

**Important:** `apple-local-llm` bundles a native `fm-proxy` binary. It must be in `asarUnpack` so Electron can spawn it at runtime.

---

## What gets simpler vs the web app

| Web app | Electron app |
|---|---|
| User runs `npx apple-local-llm --serve` manually | Auto-managed by `createClient()` |
| Health polling every 2s | One-time `compatibility.check()` |
| SSE parsing over HTTP | Native IPC streaming |
| Setup screen with copy-paste command | Gone — just works |
| "Connection Lost" overlay | Gone — process is local |

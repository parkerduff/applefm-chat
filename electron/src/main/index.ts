import { app, BrowserWindow, ipcMain, shell, dialog, ShareMenu, Menu, net } from "electron";
import { writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Patch child_process.spawn to rewrite app.asar → app.asar.unpacked
// Electron patches execFile for asar but NOT spawn, which apple-local-llm uses
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cp = require("child_process");
const _origSpawn = cp.spawn;
cp.spawn = function (cmd: string, args?: readonly string[], opts?: object) {
  if (typeof cmd === "string" && cmd.includes("app.asar")) {
    cmd = cmd.replace(/app\.asar(?!\.unpacked)/, "app.asar.unpacked");
  }
  return _origSpawn.call(this, cmd, args, opts);
};
import {
  closeDb,
  createConversation,
  listConversations,
  renameConversation,
  deleteConversation,
  pinConversation,
  archiveConversation,
  addMessage,
  getMessages,
  updateMessage,
  setBranchInfo,
} from "./db";

app.setName("ChatFM");

const UPDATE_REPO = "parkerduff/applefm-chat";
const DOWNLOAD_URL = `https://github.com/${UPDATE_REPO}/releases/latest/download/ChatFM-arm64.dmg`;

let mainWindow: BrowserWindow | null = null;
let client: any = null;
const activeStreams = new Map<string, AbortController>();

async function getClient() {
  if (!client) {
    const { createClient } = await import("apple-local-llm");
    client = createClient();
  }
  return client;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 480,
    minHeight: 400,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Dev server or production file
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Application menu with keyboard shortcuts
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        {
          label: "Check for Updates…",
          click: async () => {
            try {
              const currentVersion = app.getVersion();
              const res = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
                headers: { "Accept": "application/vnd.github.v3+json" },
              });
              if (!res.ok) throw new Error("Failed to check");
              const data = await res.json();
              const latestVersion = (data.tag_name ?? "").replace(/^v/, "");
              const isNewer = latestVersion.localeCompare(currentVersion, undefined, { numeric: true, sensitivity: "base" }) > 0;
              if (isNewer) {
                const { response } = await dialog.showMessageBox(mainWindow!, {
                  type: "info",
                  title: "Update Available",
                  message: `A new version (v${latestVersion}) is available. You're on v${currentVersion}.`,
                  buttons: ["Download", "Later"],
                  defaultId: 0,
                });
                if (response === 0) shell.openExternal(DOWNLOAD_URL);
              } else {
                dialog.showMessageBox(mainWindow!, {
                  type: "info",
                  title: "No Updates",
                  message: `You're on the latest version (v${currentVersion}).`,
                  buttons: ["OK"],
                });
              }
            } catch {
              dialog.showMessageBox(mainWindow!, {
                type: "error",
                title: "Update Check Failed",
                message: "Could not check for updates. Please try again later.",
                buttons: ["OK"],
              });
            }
          },
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("menu:new-chat"),
        },
        {
          label: "New Temporary Chat",
          accelerator: "Shift+CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("menu:new-temporary-chat"),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- IPC Handlers ---

// Compatibility check (replaces health polling)
ipcMain.handle("llm:check", async () => {
  const c = await getClient();
  return c.compatibility.check();
});

// Non-streaming generate
ipcMain.handle("llm:generate", async (_e, params) => {
  const c = await getClient();
  return c.responses.create(params);
});

// Streaming generate (event-based, scoped by requestId)
ipcMain.on("llm:stream-start", async (event, requestId: string, params) => {
  const ac = new AbortController();
  activeStreams.set(requestId, ac);
  try {
    const c = await getClient();
    let sentDone = false;
    let accumulated = "";
    for await (const chunk of c.stream(params)) {
      if (ac.signal.aborted || event.sender.isDestroyed()) break;
      if ("delta" in chunk) {
        accumulated += chunk.delta;
        event.sender.send(`llm:stream-chunk:${requestId}`, chunk.delta);
      } else if ("done" in chunk) {
        sentDone = true;
        event.sender.send(`llm:stream-done:${requestId}`, chunk.text);
      }
    }
    // Fallback: if the iterator ended without a done chunk, send one now
    if (!sentDone && !ac.signal.aborted && !event.sender.isDestroyed()) {
      event.sender.send(`llm:stream-done:${requestId}`, accumulated);
    }
  } catch (err: unknown) {
    if (!ac.signal.aborted && !event.sender.isDestroyed()) {
      const message = err instanceof Error ? err.message : "Unknown error";
      event.sender.send(`llm:stream-error:${requestId}`, message);
    }
  } finally {
    activeStreams.delete(requestId);
  }
});

// Cancel in-progress stream
ipcMain.handle("llm:cancel", async (_e, requestId: string) => {
  const ac = activeStreams.get(requestId);
  if (ac) {
    ac.abort();
    activeStreams.delete(requestId);
  }
  return { ok: true };
});

// --- DB IPC Handlers ---

ipcMain.handle("db:createConversation", (_e, id: string, title?: string) => {
  return createConversation(id, title);
});

ipcMain.handle("db:listConversations", (_e, archived?: boolean) => {
  return listConversations(archived ?? false);
});

ipcMain.handle("db:renameConversation", (_e, id: string, title: string) => {
  renameConversation(id, title);
});

ipcMain.handle("db:deleteConversation", (_e, id: string) => {
  deleteConversation(id);
});

ipcMain.handle("db:addMessage", (_e, conversationId: string, role: string, content: string, filtered: boolean) => {
  return addMessage(conversationId, role as "user" | "assistant", content, filtered);
});

ipcMain.handle("db:getMessages", (_e, conversationId: string) => {
  return getMessages(conversationId);
});

ipcMain.handle("db:updateMessage", (_e, id: number, content: string, filtered: boolean) => {
  updateMessage(id, content, filtered);
});

ipcMain.handle("db:pinConversation", (_e, id: string, pinned: boolean) => {
  pinConversation(id, pinned);
});

ipcMain.handle("db:setBranchInfo", (_e, id: string, sourceId: string, sourceTitle: string, messageCount: number) => {
  setBranchInfo(id, sourceId, sourceTitle, messageCount);
});

ipcMain.handle("db:archiveConversation", (_e, id: string, archived: boolean) => {
  archiveConversation(id, archived);
});

// --- Share IPC Handlers ---

ipcMain.handle("share:saveMarkdown", async (_e, markdown: string, title: string) => {
  if (!mainWindow) return { saved: false };
  const sanitized = title.replace(/[^a-zA-Z0-9_\- ]/g, "").slice(0, 100) || "conversation";
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${sanitized}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!result.canceled && result.filePath) {
    writeFileSync(result.filePath, markdown, "utf-8");
    return { saved: true, path: result.filePath };
  }
  return { saved: false };
});

ipcMain.handle("share:native", async (_e, markdown: string, title: string, x?: number, y?: number) => {
  if (!mainWindow) return { shared: false };
  const sanitized = title.replace(/[^a-zA-Z0-9_\- ]/g, "").slice(0, 100) || "conversation";
  const tmpDir = mkdtempSync(join(tmpdir(), "applefm-"));
  const filePath = join(tmpDir, `${sanitized}.md`);
  writeFileSync(filePath, markdown, "utf-8");
  try {
    const shareMenu = new ShareMenu({
      filePaths: [filePath],
    });
    const opts: Electron.PopupOptions = { window: mainWindow };
    if (x != null && y != null) { opts.x = Math.round(x); opts.y = Math.round(y); }
    shareMenu.popup(opts);
    // Clean up temp file after a delay to allow the share sheet to read it
    setTimeout(() => {
      try { unlinkSync(filePath); } catch { /* ignore */ }
      try { rmdirSync(tmpDir); } catch { /* ignore */ }
    }, 60_000);
    return { shared: true };
  } catch {
    try { unlinkSync(filePath); } catch { /* ignore */ }
    try { rmdirSync(tmpDir); } catch { /* ignore */ }
    return { shared: false };
  }
});

// --- Update Check ---

ipcMain.handle("app:checkForUpdate", async () => {
  try {
    const currentVersion = app.getVersion();
    const res = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { "Accept": "application/vnd.github.v3+json" },
    });
    if (!res.ok) return { updateAvailable: false };
    const data = await res.json();
    const latestTag: string = data.tag_name ?? "";
    const latestVersion = latestTag.replace(/^v/, "");
    if (!latestVersion) return { updateAvailable: false };
    const isNewer = latestVersion.localeCompare(currentVersion, undefined, { numeric: true, sensitivity: "base" }) > 0;
    return {
      updateAvailable: isNewer,
      currentVersion,
      latestVersion,
      downloadUrl: DOWNLOAD_URL,
      releaseUrl: data.html_url,
    };
  } catch {
    return { updateAvailable: false };
  }
});

ipcMain.handle("app:getVersion", () => app.getVersion());

ipcMain.handle("app:openExternal", (_e, url: string) => {
  shell.openExternal(url);
});

// --- App Lifecycle ---

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

let isQuitting = false;
app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  closeDb();
  // Abort all active streams
  Array.from(activeStreams.values()).forEach((ac) => ac.abort());
  activeStreams.clear();
  Promise.resolve()
    .then(() => client?.shutdown())
    .catch(() => {})
    .finally(() => app.quit());
});

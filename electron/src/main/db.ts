import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath("userData"), "chat-history.db");
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      filtered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at);
  `);

  // Migration: add columns if they don't exist yet (for existing DBs)
  const cols = db.prepare("PRAGMA table_info(conversations)").all() as { name: string }[];
  const colNames = cols.map((c) => c.name);
  if (!colNames.includes("pinned")) {
    db.exec("ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  }
  if (!colNames.includes("archived")) {
    db.exec("ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }
  if (!colNames.includes("branch_source_id")) {
    db.exec("ALTER TABLE conversations ADD COLUMN branch_source_id TEXT DEFAULT NULL");
  }
  if (!colNames.includes("branch_source_title")) {
    db.exec("ALTER TABLE conversations ADD COLUMN branch_source_title TEXT DEFAULT NULL");
  }
  if (!colNames.includes("branch_message_count")) {
    db.exec("ALTER TABLE conversations ADD COLUMN branch_message_count INTEGER DEFAULT NULL");
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// --- Conversation CRUD ---

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

export function createConversation(id: string, title?: string): ConversationRow {
  const d = getDb();
  const stmt = d.prepare(
    "INSERT INTO conversations (id, title) VALUES (?, ?)"
  );
  stmt.run(id, title ?? "New Chat");
  return getConversation(id)!;
}

export function getConversation(id: string): ConversationRow | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
}

export function listConversations(archived: boolean = false): ConversationRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM conversations WHERE archived = ? ORDER BY pinned DESC, updated_at DESC"
  ).all(archived ? 1 : 0) as ConversationRow[];
}

export function renameConversation(id: string, title: string): void {
  const d = getDb();
  d.prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id);
}

export function deleteConversation(id: string): void {
  const d = getDb();
  d.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

export function pinConversation(id: string, pinned: boolean): void {
  const d = getDb();
  d.prepare("UPDATE conversations SET pinned = ?, updated_at = datetime('now') WHERE id = ?").run(pinned ? 1 : 0, id);
}

export function archiveConversation(id: string, archived: boolean): void {
  const d = getDb();
  d.prepare("UPDATE conversations SET archived = ?, updated_at = datetime('now') WHERE id = ?").run(archived ? 1 : 0, id);
}

export function touchConversation(id: string): void {
  const d = getDb();
  d.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function setBranchInfo(id: string, sourceId: string, sourceTitle: string, messageCount: number): void {
  const d = getDb();
  d.prepare(
    "UPDATE conversations SET branch_source_id = ?, branch_source_title = ?, branch_message_count = ? WHERE id = ?"
  ).run(sourceId, sourceTitle, messageCount, id);
}

// --- Message CRUD ---

export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  filtered: boolean = false,
): MessageRow {
  const d = getDb();
  const info = d.prepare(
    "INSERT INTO messages (conversation_id, role, content, filtered) VALUES (?, ?, ?, ?)"
  ).run(conversationId, role, content, filtered ? 1 : 0);
  touchConversation(conversationId);
  return d.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid) as MessageRow;
}

export function getMessages(conversationId: string): MessageRow[] {
  const d = getDb();
  return d.prepare(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC"
  ).all(conversationId) as MessageRow[];
}

export function updateMessage(id: number, content: string, filtered: boolean): void {
  const d = getDb();
  d.prepare("UPDATE messages SET content = ?, filtered = ? WHERE id = ?").run(content, filtered ? 1 : 0, id);
}

export function deleteMessage(id: number): void {
  const d = getDb();
  d.prepare("DELETE FROM messages WHERE id = ?").run(id);
}

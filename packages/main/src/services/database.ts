import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

let db: Database.Database | null = null
let currentVaultPath: string | null = null

const SCHEMA_VERSION = 3

export function getDatabase(vaultPath: string): Database.Database {
  if (db && currentVaultPath === vaultPath) return db

  if (db) {
    db.close()
    db = null
  }

  const dbPath = join(vaultPath, '.nexusky', 'index.db')
  const { mkdirSync, existsSync, unlinkSync } = require('fs')
  const dir = join(vaultPath, '.nexusky')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  try {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    // Integrity check to detect corruption early
    const check = db.pragma('integrity_check') as { integrity_check: string }[]
    if (check[0]?.integrity_check !== 'ok') {
      throw new Error('integrity_check failed')
    }
  } catch {
    // Database is corrupted — delete and recreate
    if (db) { try { db.close() } catch {} }
    db = null
    try { unlinkSync(dbPath) } catch {}
    try { unlinkSync(dbPath + '-wal') } catch {}
    try { unlinkSync(dbPath + '-shm') } catch {}
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }

  currentVaultPath = vaultPath
  initSchema(db)
  runMigrations(db)
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    currentVaultPath = null
  }
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      content_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_note_id TEXT NOT NULL,
      target_note_id TEXT,
      target_title TEXT NOT NULL,
      context TEXT,
      FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_note_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_note_id);
    CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(file_path);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      title,
      content,
      content_rowid='rowid',
      tokenize='unicode61'
    );

    CREATE TABLE IF NOT EXISTS notes_fts_map (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      heading_context TEXT,
      token_count INTEGER,
      embedding BLOB,
      embedding_model TEXT,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_note ON chunks(note_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_note ON tasks(note_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT,
      session_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
  `)
}

type Migration = (db: Database.Database) => void

const migrations: Migration[] = [
  () => {},
  // Migration 2: multi-session chat
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
    `)
    const hasSessionId = db.prepare("PRAGMA table_info(conversations)").all() as { name: string }[]
    if (!hasSessionId.some((c) => c.name === 'session_id')) {
      db.exec(`ALTER TABLE conversations ADD COLUMN session_id TEXT DEFAULT NULL`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id)`)
    }
  },
  // Migration 3: fix FTS tokenize directive for older SQLite versions
  (db) => {
    const ftsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'").get()
    if (ftsExists) {
      try {
        db.prepare("SELECT * FROM notes_fts LIMIT 0").all()
      } catch {
        db.exec(`DROP TABLE IF EXISTS notes_fts`)
        db.exec(`DROP TABLE IF EXISTS notes_fts_map`)
        db.exec(`
          CREATE VIRTUAL TABLE notes_fts USING fts5(
            title,
            content,
            content_rowid='rowid',
            tokenize='unicode61'
          );
          CREATE TABLE notes_fts_map (
            rowid INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id TEXT NOT NULL UNIQUE
          );
        `)
      }
    }
  }
]

function runMigrations(db: Database.Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined
  const currentVersion = row?.version ?? 0

  if (currentVersion === 0 && !row) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION)
    return
  }

  if (currentVersion >= SCHEMA_VERSION) return

  for (let i = currentVersion; i < SCHEMA_VERSION; i++) {
    if (migrations[i]) migrations[i](db)
  }

  db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION)
}

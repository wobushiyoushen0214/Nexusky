import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

let db: Database.Database | null = null
let currentVaultPath: string | null = null

export function getDatabase(vaultPath: string): Database.Database {
  if (db && currentVaultPath === vaultPath) return db

  if (db) {
    db.close()
    db = null
  }

  const dbPath = join(vaultPath, '.nexusky', 'index.db')
  const { mkdirSync, existsSync } = require('fs')
  const dir = join(vaultPath, '.nexusky')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  currentVaultPath = vaultPath
  initSchema(db)
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
  `)
}

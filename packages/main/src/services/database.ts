import Database from 'better-sqlite3'
import { join } from 'path'

let db: Database.Database | null = null
let currentVaultPath: string | null = null

const SCHEMA_VERSION = 10

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
  repairExistingSchema(db)
  initSchema(db)
  runMigrations(db)
  repairExistingSchema(db)
  ensureDefaultKanbanColumns(db)
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
      line INTEGER NOT NULL DEFAULT 1,
      link_type TEXT NOT NULL DEFAULT 'explicit',
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

    CREATE TABLE IF NOT EXISTS note_aliases (
      note_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      PRIMARY KEY (note_id, alias),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_note_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_note_id);
    CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(file_path);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_note_aliases_alias ON note_aliases(alias);

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

    CREATE TABLE IF NOT EXISTS kanban_columns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS kanban_tasks (
      id TEXT PRIMARY KEY,
      column_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      source_note_id TEXT,
      source_file_path TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (column_id) REFERENCES kanban_columns(id) ON DELETE CASCADE,
      FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS kanban_task_relations (
      id TEXT PRIMARY KEY,
      source_task_id TEXT NOT NULL,
      target_task_id TEXT NOT NULL,
      relation_type TEXT NOT NULL CHECK (relation_type IN ('blocks', 'depends_on', 'related')),
      FOREIGN KEY (source_task_id) REFERENCES kanban_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (target_task_id) REFERENCES kanban_tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_column ON kanban_tasks(column_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_source_note ON kanban_tasks(source_note_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_relations_source ON kanban_task_relations(source_task_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_relations_target ON kanban_task_relations(target_task_id);

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
  createLongContextSchema(db)
  createProactiveSchema(db)
}

function createProactiveSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS proactive_suggestions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      cta_action TEXT NOT NULL,
      cta_payload_json TEXT NOT NULL DEFAULT '{}',
      importance INTEGER NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'pending',
      snooze_until INTEGER,
      shown_at INTEGER,
      responded_at INTEGER,
      signature TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_proactive_signature
      ON proactive_suggestions(signature);

    CREATE INDEX IF NOT EXISTS idx_proactive_status_created
      ON proactive_suggestions(status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_proactive_entity
      ON proactive_suggestions(entity_type, entity_id, status);
  `)
}

function createLongContextSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_title TEXT,
      entity_path TEXT,
      content_snapshot TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_context_events_entity
      ON context_events(entity_type, entity_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_context_events_type
      ON context_events(event_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_relations (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_title TEXT,
      source_path TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_title TEXT,
      target_path TEXT,
      relation_type TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      strength REAL NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_relations_pair_type
      ON ai_relations(source_type, source_id, target_type, target_id, relation_type);

    CREATE INDEX IF NOT EXISTS idx_ai_relations_source
      ON ai_relations(source_type, source_id, score DESC);

    CREATE INDEX IF NOT EXISTS idx_ai_relations_target
      ON ai_relations(target_type, target_id, score DESC);

    CREATE INDEX IF NOT EXISTS idx_ai_relations_type
      ON ai_relations(relation_type, score DESC);

    CREATE TABLE IF NOT EXISTS long_term_themes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      strength REAL NOT NULL DEFAULT 0,
      evidence_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_long_term_themes_strength
      ON long_term_themes(strength DESC, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS theme_memberships (
      id TEXT PRIMARY KEY,
      theme_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_title TEXT,
      entity_path TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (theme_id) REFERENCES long_term_themes(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_theme_memberships_unique
      ON theme_memberships(theme_id, entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS relation_feedback (
      id TEXT PRIMARY KEY,
      relation_id TEXT NOT NULL,
      feedback_type TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (relation_id) REFERENCES ai_relations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_relation_feedback_relation
      ON relation_feedback(relation_id, created_at DESC);
  `)
}

type Migration = (db: Database.Database) => void

function tableExists(db: Database.Database, tableName: string): boolean {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual table') AND name = ?").get(tableName))
}

function tableColumns(db: Database.Database, tableName: string): Set<string> {
  if (!tableExists(db, tableName)) return new Set()
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

function ensureColumn(db: Database.Database, tableName: string, columnName: string, definition: string): void {
  if (!tableExists(db, tableName)) return
  if (tableColumns(db, tableName).has(columnName)) return
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`)
}

function repairExistingSchema(db: Database.Database): void {
  ensureColumn(db, 'notes', 'id', "id TEXT DEFAULT ''")
  ensureColumn(db, 'notes', 'title', "title TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'notes', 'file_path', "file_path TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'notes', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'notes', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'notes', 'content_hash', "content_hash TEXT NOT NULL DEFAULT ''")

  ensureColumn(db, 'links', 'source_note_id', "source_note_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'links', 'target_note_id', 'target_note_id TEXT')
  ensureColumn(db, 'links', 'target_title', "target_title TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'links', 'context', 'context TEXT')
  ensureColumn(db, 'links', 'line', 'line INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'links', 'link_type', "link_type TEXT NOT NULL DEFAULT 'explicit'")

  ensureColumn(db, 'tasks', 'note_id', "note_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'tasks', 'text', "text TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'tasks', 'done', 'done INTEGER NOT NULL DEFAULT 0')

  ensureColumn(db, 'chunks', 'note_id', "note_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'chunks', 'chunk_index', 'chunk_index INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'chunks', 'content', "content TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'chunks', 'heading_context', 'heading_context TEXT')
  ensureColumn(db, 'chunks', 'token_count', 'token_count INTEGER')
  ensureColumn(db, 'chunks', 'embedding', 'embedding BLOB')
  ensureColumn(db, 'chunks', 'embedding_model', 'embedding_model TEXT')

  ensureColumn(db, 'conversations', 'sources', 'sources TEXT')
  ensureColumn(db, 'conversations', 'session_id', 'session_id TEXT DEFAULT NULL')

  ensureColumn(db, 'chat_sessions', 'title', "title TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'chat_sessions', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'chat_sessions', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')

  ensureColumn(db, 'kanban_columns', 'name', "name TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'kanban_columns', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0')

  ensureColumn(db, 'kanban_tasks', 'column_id', "column_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'kanban_tasks', 'title', "title TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'kanban_tasks', 'description', "description TEXT DEFAULT ''")
  ensureColumn(db, 'kanban_tasks', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'kanban_tasks', 'priority', 'priority INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'kanban_tasks', 'due_date', 'due_date TEXT')
  ensureColumn(db, 'kanban_tasks', 'source_note_id', 'source_note_id TEXT')
  ensureColumn(db, 'kanban_tasks', 'source_file_path', 'source_file_path TEXT')
  ensureColumn(db, 'kanban_tasks', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'kanban_tasks', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')

  ensureColumn(db, 'kanban_task_relations', 'source_task_id', "source_task_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'kanban_task_relations', 'target_task_id', "target_task_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'kanban_task_relations', 'relation_type', "relation_type TEXT NOT NULL DEFAULT 'related'")

  ensureColumn(db, 'context_events', 'id', "id TEXT DEFAULT ''")
  ensureColumn(db, 'context_events', 'event_type', "event_type TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'context_events', 'entity_type', "entity_type TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'context_events', 'entity_id', "entity_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'context_events', 'entity_title', 'entity_title TEXT')
  ensureColumn(db, 'context_events', 'entity_path', 'entity_path TEXT')
  ensureColumn(db, 'context_events', 'content_snapshot', 'content_snapshot TEXT')
  ensureColumn(db, 'context_events', 'metadata_json', 'metadata_json TEXT')
  ensureColumn(db, 'context_events', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')

  ensureColumn(db, 'ai_relations', 'id', "id TEXT DEFAULT ''")
  ensureColumn(db, 'ai_relations', 'source_type', "source_type TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'ai_relations', 'source_id', "source_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'ai_relations', 'source_title', 'source_title TEXT')
  ensureColumn(db, 'ai_relations', 'source_path', 'source_path TEXT')
  ensureColumn(db, 'ai_relations', 'target_type', "target_type TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'ai_relations', 'target_id', "target_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'ai_relations', 'target_title', 'target_title TEXT')
  ensureColumn(db, 'ai_relations', 'target_path', 'target_path TEXT')
  ensureColumn(db, 'ai_relations', 'relation_type', "relation_type TEXT NOT NULL DEFAULT 'related_to'")
  ensureColumn(db, 'ai_relations', 'confidence', 'confidence REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'ai_relations', 'strength', 'strength REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'ai_relations', 'score', 'score REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'ai_relations', 'evidence_json', "evidence_json TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(db, 'ai_relations', 'reason', "reason TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'ai_relations', 'status', "status TEXT NOT NULL DEFAULT 'active'")
  ensureColumn(db, 'ai_relations', 'first_seen_at', 'first_seen_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'ai_relations', 'last_seen_at', 'last_seen_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'ai_relations', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'ai_relations', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')

  ensureColumn(db, 'long_term_themes', 'id', "id TEXT DEFAULT ''")
  ensureColumn(db, 'long_term_themes', 'title', "title TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'long_term_themes', 'summary', "summary TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'long_term_themes', 'keywords_json', "keywords_json TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(db, 'long_term_themes', 'strength', 'strength REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'long_term_themes', 'evidence_count', 'evidence_count INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'long_term_themes', 'status', "status TEXT NOT NULL DEFAULT 'active'")
  ensureColumn(db, 'long_term_themes', 'first_seen_at', 'first_seen_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'long_term_themes', 'last_seen_at', 'last_seen_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'long_term_themes', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'long_term_themes', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')

  ensureColumn(db, 'theme_memberships', 'id', "id TEXT DEFAULT ''")
  ensureColumn(db, 'theme_memberships', 'theme_id', "theme_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'theme_memberships', 'entity_type', "entity_type TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'theme_memberships', 'entity_id', "entity_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'theme_memberships', 'entity_title', 'entity_title TEXT')
  ensureColumn(db, 'theme_memberships', 'entity_path', 'entity_path TEXT')
  ensureColumn(db, 'theme_memberships', 'confidence', 'confidence REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'theme_memberships', 'evidence_json', "evidence_json TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(db, 'theme_memberships', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'theme_memberships', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')

  ensureColumn(db, 'relation_feedback', 'id', "id TEXT DEFAULT ''")
  ensureColumn(db, 'relation_feedback', 'relation_id', "relation_id TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'relation_feedback', 'feedback_type', "feedback_type TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'relation_feedback', 'note', 'note TEXT')
  ensureColumn(db, 'relation_feedback', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')

  ensureColumn(db, 'proactive_suggestions', 'id', "id TEXT DEFAULT ''")
  ensureColumn(db, 'proactive_suggestions', 'kind', "kind TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'proactive_suggestions', 'source_ref', "source_ref TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'proactive_suggestions', 'entity_type', 'entity_type TEXT')
  ensureColumn(db, 'proactive_suggestions', 'entity_id', 'entity_id TEXT')
  ensureColumn(db, 'proactive_suggestions', 'title', "title TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'proactive_suggestions', 'body', "body TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'proactive_suggestions', 'cta_action', "cta_action TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'proactive_suggestions', 'cta_payload_json', "cta_payload_json TEXT NOT NULL DEFAULT '{}'")
  ensureColumn(db, 'proactive_suggestions', 'importance', 'importance INTEGER NOT NULL DEFAULT 50')
  ensureColumn(db, 'proactive_suggestions', 'status', "status TEXT NOT NULL DEFAULT 'pending'")
  ensureColumn(db, 'proactive_suggestions', 'snooze_until', 'snooze_until INTEGER')
  ensureColumn(db, 'proactive_suggestions', 'shown_at', 'shown_at INTEGER')
  ensureColumn(db, 'proactive_suggestions', 'responded_at', 'responded_at INTEGER')
  ensureColumn(db, 'proactive_suggestions', 'signature', "signature TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'proactive_suggestions', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'proactive_suggestions', 'updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')

  if (tableExists(db, 'links') && tableExists(db, 'notes') && tableColumns(db, 'links').has('source_note_id')) {
    db.exec("DELETE FROM links WHERE source_note_id = '' OR source_note_id NOT IN (SELECT id FROM notes)")
  }
}

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
  },
  // Migration 4: independent kanban board
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kanban_columns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS kanban_tasks (
        id TEXT PRIMARY KEY,
        column_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 0,
        due_date TEXT,
        source_note_id TEXT,
        source_file_path TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (column_id) REFERENCES kanban_columns(id) ON DELETE CASCADE,
        FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS kanban_task_relations (
        id TEXT PRIMARY KEY,
        source_task_id TEXT NOT NULL,
        target_task_id TEXT NOT NULL,
        relation_type TEXT NOT NULL CHECK (relation_type IN ('blocks', 'depends_on', 'related')),
        FOREIGN KEY (source_task_id) REFERENCES kanban_tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (target_task_id) REFERENCES kanban_tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_kanban_tasks_column ON kanban_tasks(column_id);
      CREATE INDEX IF NOT EXISTS idx_kanban_tasks_source_note ON kanban_tasks(source_note_id);
      CREATE INDEX IF NOT EXISTS idx_kanban_relations_source ON kanban_task_relations(source_task_id);
      CREATE INDEX IF NOT EXISTS idx_kanban_relations_target ON kanban_task_relations(target_task_id);
    `)
  },
  // Migration 5: source note fields for generated kanban tasks
  (db) => {
    const taskColumns = db.prepare('PRAGMA table_info(kanban_tasks)').all() as { name: string }[]
    if (!taskColumns.some((c) => c.name === 'source_note_id')) {
      db.exec('ALTER TABLE kanban_tasks ADD COLUMN source_note_id TEXT')
    }
    if (!taskColumns.some((c) => c.name === 'source_file_path')) {
      db.exec('ALTER TABLE kanban_tasks ADD COLUMN source_file_path TEXT')
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_kanban_tasks_source_note ON kanban_tasks(source_note_id)')
  },
  // Migration 6: add link_type to links table for distinguishing explicit vs inferred links
  (db) => {
    const linkColumns = db.prepare('PRAGMA table_info(links)').all() as { name: string }[]
    if (!linkColumns.some((c) => c.name === 'link_type')) {
      db.exec("ALTER TABLE links ADD COLUMN link_type TEXT NOT NULL DEFAULT 'explicit'")
    }
  },
  // Migration 7: Obsidian-style aliases from frontmatter
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS note_aliases (
        note_id TEXT NOT NULL,
        alias TEXT NOT NULL,
        PRIMARY KEY (note_id, alias),
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_note_aliases_alias ON note_aliases(alias);
    `)
  },
  // Migration 8: line numbers for explicit wikilinks
  (db) => {
    const linkColumns = db.prepare('PRAGMA table_info(links)').all() as { name: string }[]
    if (!linkColumns.some((c) => c.name === 'line')) {
      db.exec('ALTER TABLE links ADD COLUMN line INTEGER NOT NULL DEFAULT 1')
    }
  },
  // Migration 9: long-term context system tables
  (db) => {
    createLongContextSchema(db)
  },
  // Migration 10: proactive AI suggestions table
  (db) => {
    createProactiveSchema(db)
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

function ensureDefaultKanbanColumns(db: Database.Database): void {
  const colCount = db.prepare('SELECT COUNT(*) as c FROM kanban_columns').get() as { c: number }
  if (colCount.c > 0) return

  db.exec(`
    INSERT INTO kanban_columns (id, name, sort_order) VALUES ('col-todo', '待办', 0);
    INSERT INTO kanban_columns (id, name, sort_order) VALUES ('col-in-progress', '进行中', 1);
    INSERT INTO kanban_columns (id, name, sort_order) VALUES ('col-done', '已完成', 2);
  `)
}

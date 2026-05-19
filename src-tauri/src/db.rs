use regex::Regex;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

fn as_str<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("missing {key}"))
}

fn db_path(vault_path: &str) -> PathBuf {
    Path::new(vault_path).join(".nexusky").join("index.db")
}

fn connection(vault_path: &str) -> Result<Connection, String> {
    let path = db_path(vault_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    ensure_default_kanban_columns(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
    r#"
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
      link_type TEXT NOT NULL DEFAULT 'explicit',
      FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
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
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, content, tokenize='unicode61');
    CREATE TABLE IF NOT EXISTS notes_fts_map (rowid INTEGER PRIMARY KEY AUTOINCREMENT, note_id TEXT NOT NULL UNIQUE);
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
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS kanban_task_relations (
      id TEXT PRIMARY KEY,
      source_task_id TEXT NOT NULL,
      target_task_id TEXT NOT NULL,
      relation_type TEXT NOT NULL CHECK (relation_type IN ('blocks', 'depends_on', 'related'))
    );
    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_column ON kanban_tasks(column_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_relations_source ON kanban_task_relations(source_task_id);
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
    "#,
  ).map_err(|e| e.to_string())
}

fn ensure_default_kanban_columns(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM kanban_columns", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count == 0 {
        for (i, (id, name)) in [("todo", "待办"), ("doing", "进行中"), ("done", "已完成")]
            .iter()
            .enumerate()
        {
            conn.execute(
                "INSERT INTO kanban_columns (id, name, sort_order) VALUES (?1, ?2, ?3)",
                params![id, name, i as i64],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn collect_markdown_files(vault_path: &str) -> Vec<PathBuf> {
    WalkDir::new(vault_path)
        .into_iter()
        .filter_entry(|e| {
            !e.file_name().to_string_lossy().starts_with('.') && e.file_name() != "node_modules"
        })
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_type().is_file() && e.path().extension().and_then(|s| s.to_str()) == Some("md")
        })
        .map(|e| e.path().to_path_buf())
        .collect()
}

fn rel_path(vault_path: &str, file_path: &Path) -> Result<String, String> {
    file_path
        .strip_prefix(vault_path)
        .map_err(|e| e.to_string())
        .map(|p| {
            p.to_string_lossy()
                .replace('\\', "/")
                .trim_start_matches('/')
                .to_string()
        })
}

fn extract_frontmatter(raw: &str) -> (HashMap<String, Value>, String) {
    if !raw.starts_with("---\n") {
        return (HashMap::new(), raw.to_string());
    }
    let Some(end) = raw[4..].find("\n---") else {
        return (HashMap::new(), raw.to_string());
    };
    let fm_raw = &raw[4..4 + end];
    let content = raw[4 + end + 4..].trim_start_matches('\n').to_string();
    let mut map = HashMap::new();
    for line in fm_raw.lines() {
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim().to_string();
            let value = value.trim();
            if value.starts_with('[') && value.ends_with(']') {
                let items = value
                    .trim_matches(['[', ']'])
                    .split(',')
                    .map(|s| Value::String(s.trim().trim_matches('"').to_string()))
                    .collect();
                map.insert(key, Value::Array(items));
            } else {
                map.insert(key, Value::String(value.trim_matches('"').to_string()));
            }
        }
    }
    (map, content)
}

fn extract_title(frontmatter: &HashMap<String, Value>, content: &str, file_path: &Path) -> String {
    if let Some(title) = frontmatter
        .get("title")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        return title.to_string();
    }
    for line in content.lines() {
        if let Some(title) = line.strip_prefix("# ") {
            return title.trim().to_string();
        }
    }
    file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

fn extract_links(content: &str) -> Vec<(String, String)> {
    let re = Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap();
    let mut links = Vec::new();
    for line in content.lines() {
        for cap in re.captures_iter(line) {
            links.push((
                cap[1].trim().to_string(),
                line.trim().chars().take(200).collect(),
            ));
        }
    }
    links
}

fn extract_tags(frontmatter: &HashMap<String, Value>, content: &str) -> Vec<String> {
    let mut tags = HashSet::new();
    if let Some(values) = frontmatter.get("tags").and_then(Value::as_array) {
        for value in values {
            if let Some(tag) = value.as_str().filter(|s| !s.is_empty()) {
                tags.insert(tag.trim_start_matches('#').to_string());
            }
        }
    }
    let re = Regex::new(r"(?:^|\s)#([\p{L}\p{N}_-]+)").unwrap();
    for cap in re.captures_iter(content) {
        tags.insert(cap[1].to_string());
    }
    tags.into_iter().collect()
}

fn extract_tasks(content: &str) -> Vec<(String, bool)> {
    let re = Regex::new(r"^\s*[-*]\s+\[([ xX])\]\s+(.+)$").unwrap();
    content
        .lines()
        .filter_map(|line| {
            let cap = re.captures(line)?;
            Some((cap[2].trim().to_string(), cap[1].eq_ignore_ascii_case("x")))
        })
        .collect()
}

fn file_time_ms(path: &Path, created: bool) -> i64 {
    let meta = fs::metadata(path).ok();
    let time = meta.and_then(|m| {
        if created {
            m.created().ok()
        } else {
            m.modified().ok()
        }
    });
    time.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn index_note(conn: &mut Connection, vault_path: &str, file_path: &Path) -> Result<(), String> {
    let raw = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let hash = format!("{:x}", md5::compute(&raw));
    let rel = rel_path(vault_path, file_path)?;
    let existing: Option<String> = conn
        .query_row(
            "SELECT content_hash FROM notes WHERE file_path = ?1",
            params![rel],
            |r| r.get(0),
        )
        .ok();
    if existing.as_deref() == Some(hash.as_str()) {
        return Ok(());
    }

    let (frontmatter, content) = extract_frontmatter(&raw);
    let title = extract_title(&frontmatter, &content, file_path);
    let id = format!("{:x}", md5::compute(&rel));
    let links = extract_links(&content);
    let tags = extract_tags(&frontmatter, &content);
    let tasks = extract_tasks(&content);

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
    r#"
    INSERT INTO notes (id, title, file_path, created_at, updated_at, content_hash)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(file_path) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at, content_hash = excluded.content_hash
    "#,
    params![id, title, rel, file_time_ms(file_path, true), file_time_ms(file_path, false), hash],
  ).map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM links WHERE source_note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    for (target, context) in links {
        tx.execute(
            "INSERT INTO links (source_note_id, target_title, context) VALUES (?1, ?2, ?3)",
            params![id, target, context],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.execute("DELETE FROM note_tags WHERE note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    for tag in tags {
        tx.execute(
            "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
            params![tag],
        )
        .map_err(|e| e.to_string())?;
        let tag_id: i64 = tx
            .query_row("SELECT id FROM tags WHERE name = ?1", params![tag], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            params![id, tag_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.execute("DELETE FROM tasks WHERE note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    for (text, done) in tasks {
        tx.execute(
            "INSERT INTO tasks (note_id, text, done) VALUES (?1, ?2, ?3)",
            params![id, text, if done { 1 } else { 0 }],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.execute(
        "INSERT OR IGNORE INTO notes_fts_map (note_id) VALUES (?1)",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    let rowid: i64 = tx
        .query_row(
            "SELECT rowid FROM notes_fts_map WHERE note_id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM notes_fts WHERE rowid = ?1", params![rowid])
        .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO notes_fts (rowid, title, content) VALUES (?1, ?2, ?3)",
        params![rowid, title, content],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    resolve_links(conn, &id, &title)?;
    Ok(())
}

fn resolve_links(conn: &Connection, note_id: &str, title: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE links SET target_note_id = ?1 WHERE target_title = ?2 AND target_note_id IS NULL",
        params![note_id, title],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
    r#"
    UPDATE links SET target_note_id = (
      SELECT id FROM notes WHERE title = links.target_title
      UNION
      SELECT id FROM notes WHERE REPLACE(REPLACE(file_path, RTRIM(file_path, REPLACE(file_path, '/', '')), ''), '.md', '') = links.target_title
      LIMIT 1
    )
    WHERE target_note_id IS NULL
    "#,
    [],
  ).map_err(|e| e.to_string())?;
    Ok(())
}

fn split_chunks(content: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for line in content.lines() {
        if current.len() + line.len() > 900 && !current.trim().is_empty() {
            chunks.push(current.trim().to_string());
            current.clear();
        }
        current.push_str(line);
        current.push('\n');
    }
    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }
    chunks
}

fn index_note_chunks(
    conn: &Connection,
    note_id: &str,
    content: &str,
    model: &str,
) -> Result<usize, String> {
    conn.execute("DELETE FROM chunks WHERE note_id = ?1", params![note_id])
        .map_err(|e| e.to_string())?;
    let chunks = split_chunks(content);
    for (index, chunk) in chunks.iter().enumerate() {
        let id = format!("{:x}", md5::compute(format!("{note_id}:{index}")));
        conn.execute(
            "INSERT INTO chunks (id, note_id, chunk_index, content, heading_context, token_count, embedding_model) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, note_id, index as i64, chunk, "", (chunk.len() / 4).max(1) as i64, model],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(chunks.len())
}

fn terms(text: &str) -> HashSet<String> {
    Regex::new(r"[\p{L}\p{N}_-]+")
        .unwrap()
        .find_iter(&text.to_lowercase())
        .map(|m| m.as_str().to_string())
        .filter(|term| term.chars().count() > 1)
        .collect()
}

fn lexical_score(query: &HashSet<String>, text: &str) -> f64 {
    if query.is_empty() {
        return 0.0;
    }
    let haystack = terms(text);
    let matches = query.iter().filter(|term| haystack.contains(*term)).count();
    matches as f64 / query.len() as f64
}

fn remove_note_index(conn: &Connection, vault_path: &str, file_path: &Path) -> Result<(), String> {
    let rel = rel_path(vault_path, file_path)?;
    let note_id: Option<String> = conn
        .query_row(
            "SELECT id FROM notes WHERE file_path = ?1",
            params![rel],
            |r| r.get(0),
        )
        .ok();
    if let Some(id) = note_id {
        let rowid: Option<i64> = conn
            .query_row(
                "SELECT rowid FROM notes_fts_map WHERE note_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .ok();
        if let Some(rowid) = rowid {
            conn.execute("DELETE FROM notes_fts WHERE rowid = ?1", params![rowid])
                .map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM notes_fts_map WHERE note_id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
    }
    conn.execute("DELETE FROM notes WHERE file_path = ?1", params![rel])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn handle(channel: &str, params: Value) -> Result<Option<Value>, String> {
    match channel {
        "db:index-vault" => {
            let vault = as_str(&params, "vaultPath")?;
            let mut conn = connection(vault)?;
            let files = collect_markdown_files(vault);
            let existing: HashSet<String> = files
                .iter()
                .filter_map(|p| rel_path(vault, p).ok())
                .collect();
            let mut stmt = conn
                .prepare("SELECT file_path FROM notes")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            let stale: Vec<String> = rows
                .filter_map(Result::ok)
                .filter(|p| !existing.contains(p))
                .collect();
            drop(stmt);
            for stale_path in stale {
                remove_note_index(&conn, vault, &Path::new(vault).join(stale_path))?;
            }
            for file in &files {
                index_note(&mut conn, vault, file)?;
            }
            Ok(Some(json!({ "indexed": files.len() })))
        }
        "db:index-file" => {
            let vault = as_str(&params, "vaultPath")?;
            let file = Path::new(as_str(&params, "filePath")?);
            let mut conn = connection(vault)?;
            index_note(&mut conn, vault, file)?;
            Ok(Some(Value::Null))
        }
        "db:remove-file" => {
            let vault = as_str(&params, "vaultPath")?;
            let conn = connection(vault)?;
            remove_note_index(&conn, vault, Path::new(as_str(&params, "filePath")?))?;
            Ok(Some(Value::Null))
        }
        "db:remove-folder" => {
            let vault = as_str(&params, "vaultPath")?;
            let conn = connection(vault)?;
            let folder = Path::new(as_str(&params, "folderPath")?);
            let rel_folder = format!("{}/", rel_path(vault, folder)?);
            let mut stmt = conn
                .prepare("SELECT file_path FROM notes WHERE file_path LIKE ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![format!("{rel_folder}%")], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            let paths: Vec<String> = rows.filter_map(Result::ok).collect();
            drop(stmt);
            for path in paths {
                remove_note_index(&conn, vault, &Path::new(vault).join(path))?;
            }
            Ok(Some(Value::Null))
        }
        "db:get-all-notes" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let mut stmt = conn.prepare("SELECT id, title, file_path, created_at, updated_at, content_hash FROM notes ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(json!({
                      "id": r.get::<_, String>(0)?,
                      "title": r.get::<_, String>(1)?,
                      "filePath": r.get::<_, String>(2)?,
                      "createdAt": r.get::<_, i64>(3)?,
                      "updatedAt": r.get::<_, i64>(4)?,
                      "contentHash": r.get::<_, String>(5)?
                    }))
                })
                .map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "db:get-recent-notes" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let limit = params.get("limit").and_then(Value::as_i64).unwrap_or(50);
            let mut stmt = conn
                .prepare("SELECT id, title, file_path FROM notes ORDER BY updated_at DESC LIMIT ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![limit], |r| Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "filePath": r.get::<_, String>(2)? }))).map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "db:search-notes" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let pattern = format!("%{}%", as_str(&params, "query")?);
            let mut stmt = conn.prepare("SELECT id, title, file_path FROM notes WHERE title LIKE ?1 ORDER BY updated_at DESC LIMIT 20").map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![pattern], |r| Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "filePath": r.get::<_, String>(2)? }))).map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "db:fulltext-search" => {
            let vault = as_str(&params, "vaultPath")?;
            let query = as_str(&params, "query")?
                .replace(['"', '\''], "")
                .trim()
                .to_string();
            if query.is_empty() {
                return Ok(Some(json!([])));
            }
            if params
                .get("regex")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                return regex_search(vault, &query).map(Some);
            }
            let conn = connection(vault)?;
            let mut stmt = conn.prepare(
        "SELECT n.file_path, n.title, snippet(notes_fts, 1, '<<', '>>', '...', 32), 0 FROM notes_fts JOIN notes_fts_map m ON m.rowid = notes_fts.rowid JOIN notes n ON n.id = m.note_id WHERE notes_fts MATCH ?1 LIMIT 50"
      ).map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![query], |r| Ok(json!({ "filePath": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "line": r.get::<_, String>(2)?, "lineNumber": r.get::<_, i64>(3)? }))).map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "db:get-backlinks" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let note_id = as_str(&params, "noteId")?;
            let title: Option<String> = conn
                .query_row(
                    "SELECT title FROM notes WHERE id = ?1",
                    params![note_id],
                    |r| r.get(0),
                )
                .ok();
            let Some(title) = title else {
                return Ok(Some(json!([])));
            };
            let mut stmt = conn.prepare("SELECT n.title, n.file_path, l.context FROM links l JOIN notes n ON n.id = l.source_note_id WHERE l.target_title = ?1 AND l.source_note_id != ?2").map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![title, note_id], |r| Ok(json!({ "sourceTitle": r.get::<_, String>(0)?, "sourcePath": r.get::<_, String>(1)?, "context": r.get::<_, String>(2)? }))).map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "db:get-graph" => get_graph(as_str(&params, "vaultPath")?).map(Some),
        "db:get-tags" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let mut stmt = conn.prepare("SELECT t.name, COUNT(nt.note_id) FROM tags t JOIN note_tags nt ON nt.tag_id = t.id GROUP BY t.id ORDER BY COUNT(nt.note_id) DESC, t.name").map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| {
                    Ok(json!({ "name": r.get::<_, String>(0)?, "count": r.get::<_, i64>(1)? }))
                })
                .map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "db:get-notes-by-tag" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let tag = as_str(&params, "tag")?;
            let mut stmt = conn.prepare("SELECT n.id, n.title, n.file_path FROM notes n JOIN note_tags nt ON nt.note_id = n.id JOIN tags t ON t.id = nt.tag_id WHERE t.name = ?1 ORDER BY n.updated_at DESC").map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![tag], |r| Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "filePath": r.get::<_, String>(2)? }))).map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "db:get-tasks" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let mut stmt = conn.prepare("SELECT t.id, t.text, t.done, n.title, n.file_path FROM tasks t JOIN notes n ON n.id = t.note_id ORDER BY n.updated_at DESC").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| Ok(json!({ "id": r.get::<_, i64>(0)?, "text": r.get::<_, String>(1)?, "done": r.get::<_, i64>(2)? == 1, "title": r.get::<_, String>(3)?, "filePath": r.get::<_, String>(4)? }))).map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "kanban:get-columns" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let mut stmt = conn
                .prepare("SELECT id, name, sort_order FROM kanban_columns ORDER BY sort_order ASC")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| Ok(json!({ "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "sortOrder": r.get::<_, i64>(2)? }))).map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "kanban:create-column" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let max_order: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM kanban_columns",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(-1);
            conn.execute(
                "INSERT INTO kanban_columns (id, name, sort_order) VALUES (?1, ?2, ?3)",
                params![
                    as_str(&params, "id")?,
                    as_str(&params, "name")?,
                    max_order + 1
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "kanban:rename-column" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            conn.execute(
                "UPDATE kanban_columns SET name = ?1 WHERE id = ?2",
                params![as_str(&params, "name")?, as_str(&params, "id")?],
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "kanban:delete-column" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            conn.execute(
                "DELETE FROM kanban_columns WHERE id = ?1",
                params![as_str(&params, "id")?],
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "kanban:reorder-columns" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            if let Some(ids) = params.get("columnIds").and_then(Value::as_array) {
                for (i, id) in ids.iter().filter_map(Value::as_str).enumerate() {
                    conn.execute(
                        "UPDATE kanban_columns SET sort_order = ?1 WHERE id = ?2",
                        params![i as i64, id],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
            Ok(Some(Value::Null))
        }
        "kanban:get-tasks" => get_kanban_tasks(as_str(&params, "vaultPath")?).map(Some),
        "kanban:create-task" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let column_id = as_str(&params, "columnId")?;
            let max_order: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM kanban_tasks WHERE column_id = ?1",
                    params![column_id],
                    |r| r.get(0),
                )
                .unwrap_or(-1);
            conn.execute(
        "INSERT INTO kanban_tasks (id, column_id, title, description, sort_order, priority, due_date, source_note_id, source_file_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, unixepoch(), unixepoch())",
        params![
          as_str(&params, "id")?,
          column_id,
          as_str(&params, "title")?,
          params.get("description").and_then(Value::as_str).unwrap_or(""),
          max_order + 1,
          params.get("priority").and_then(Value::as_i64).unwrap_or(0),
          params.get("dueDate").and_then(Value::as_str),
          params.get("sourceNoteId").and_then(Value::as_str),
          params.get("sourceFilePath").and_then(Value::as_str)
        ]
      ).map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "kanban:update-task" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let id = as_str(&params, "id")?;
            if let Some(v) = params.get("title").and_then(Value::as_str) {
                conn.execute(
                    "UPDATE kanban_tasks SET title = ?1, updated_at = unixepoch() WHERE id = ?2",
                    params![v, id],
                )
                .map_err(|e| e.to_string())?;
            }
            if let Some(v) = params.get("description").and_then(Value::as_str) {
                conn.execute("UPDATE kanban_tasks SET description = ?1, updated_at = unixepoch() WHERE id = ?2", params![v, id]).map_err(|e| e.to_string())?;
            }
            if let Some(v) = params.get("columnId").and_then(Value::as_str) {
                conn.execute("UPDATE kanban_tasks SET column_id = ?1, updated_at = unixepoch() WHERE id = ?2", params![v, id]).map_err(|e| e.to_string())?;
            }
            if let Some(v) = params.get("sortOrder").and_then(Value::as_i64) {
                conn.execute("UPDATE kanban_tasks SET sort_order = ?1, updated_at = unixepoch() WHERE id = ?2", params![v, id]).map_err(|e| e.to_string())?;
            }
            if let Some(v) = params.get("priority").and_then(Value::as_i64) {
                conn.execute(
                    "UPDATE kanban_tasks SET priority = ?1, updated_at = unixepoch() WHERE id = ?2",
                    params![v, id],
                )
                .map_err(|e| e.to_string())?;
            }
            if params.get("dueDate").is_some() {
                conn.execute(
                    "UPDATE kanban_tasks SET due_date = ?1, updated_at = unixepoch() WHERE id = ?2",
                    params![params.get("dueDate").and_then(Value::as_str), id],
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(Some(Value::Null))
        }
        "kanban:delete-task" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            conn.execute(
                "DELETE FROM kanban_tasks WHERE id = ?1",
                params![as_str(&params, "id")?],
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "kanban:move-task" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            conn.execute("UPDATE kanban_tasks SET column_id = ?1, sort_order = ?2, updated_at = unixepoch() WHERE id = ?3", params![as_str(&params, "columnId")?, params.get("sortOrder").and_then(Value::as_i64).unwrap_or(0), as_str(&params, "taskId")?]).map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "kanban:reorder-tasks" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            if let Some(moves) = params.get("moves").and_then(Value::as_array) {
                for m in moves {
                    let Some(id) = m.get("id").and_then(Value::as_str) else {
                        continue;
                    };
                    let Some(column_id) = m.get("columnId").and_then(Value::as_str) else {
                        continue;
                    };
                    let sort_order = m.get("sortOrder").and_then(Value::as_i64).unwrap_or(0);
                    conn.execute("UPDATE kanban_tasks SET column_id = ?1, sort_order = ?2, updated_at = unixepoch() WHERE id = ?3", params![column_id, sort_order, id]).map_err(|e| e.to_string())?;
                }
            }
            Ok(Some(Value::Null))
        }
        "kanban:get-relations" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let sql = if params.get("taskId").and_then(Value::as_str).is_some() {
                "SELECT id, source_task_id, target_task_id, relation_type FROM kanban_task_relations WHERE source_task_id = ?1 OR target_task_id = ?1"
            } else {
                "SELECT id, source_task_id, target_task_id, relation_type FROM kanban_task_relations"
            };
            let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
            let rows = if let Some(task_id) = params.get("taskId").and_then(Value::as_str) {
                stmt.query_map(params![task_id], |r| Ok(json!({ "id": r.get::<_, String>(0)?, "sourceTaskId": r.get::<_, String>(1)?, "targetTaskId": r.get::<_, String>(2)?, "relationType": r.get::<_, String>(3)? }))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect()
            } else {
                stmt.query_map([], |r| Ok(json!({ "id": r.get::<_, String>(0)?, "sourceTaskId": r.get::<_, String>(1)?, "targetTaskId": r.get::<_, String>(2)?, "relationType": r.get::<_, String>(3)? }))).map_err(|e| e.to_string())?.filter_map(Result::ok).collect()
            };
            Ok(Some(Value::Array(rows)))
        }
        "kanban:create-relation" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            conn.execute("INSERT INTO kanban_task_relations (id, source_task_id, target_task_id, relation_type) VALUES (?1, ?2, ?3, ?4)", params![as_str(&params, "id")?, as_str(&params, "sourceTaskId")?, as_str(&params, "targetTaskId")?, as_str(&params, "relationType")?]).map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "kanban:delete-relation" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            conn.execute(
                "DELETE FROM kanban_task_relations WHERE id = ?1",
                params![as_str(&params, "id")?],
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "db:chat-history-load" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let session_id = params.get("sessionId").and_then(Value::as_str);
            let mut stmt = if session_id.is_some() {
                conn.prepare("SELECT id, role, content, sources FROM conversations WHERE session_id = ?1 ORDER BY created_at ASC, id ASC").map_err(|e| e.to_string())?
            } else {
                conn.prepare("SELECT id, role, content, sources FROM conversations WHERE session_id IS NULL ORDER BY created_at ASC, id ASC").map_err(|e| e.to_string())?
            };
            let rows = if let Some(session_id) = session_id {
                stmt.query_map(params![session_id], chat_row)
                    .map_err(|e| e.to_string())?
                    .filter_map(Result::ok)
                    .collect()
            } else {
                stmt.query_map([], chat_row)
                    .map_err(|e| e.to_string())?
                    .filter_map(Result::ok)
                    .collect()
            };
            Ok(Some(Value::Array(rows)))
        }
        "db:chat-history-append" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let sources = params.get("sources").map(|v| v.to_string());
            conn.execute("INSERT INTO conversations (role, content, sources, session_id) VALUES (?1, ?2, ?3, ?4)", params![as_str(&params, "role")?, as_str(&params, "content")?, sources, params.get("sessionId").and_then(Value::as_str)]).map_err(|e| e.to_string())?;
            if let Some(session_id) = params.get("sessionId").and_then(Value::as_str) {
                conn.execute(
                    "UPDATE chat_sessions SET updated_at = unixepoch() WHERE id = ?1",
                    params![session_id],
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(Some(Value::Null))
        }
        "db:chat-history-clear" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            if let Some(session_id) = params.get("sessionId").and_then(Value::as_str) {
                conn.execute(
                    "DELETE FROM conversations WHERE session_id = ?1",
                    params![session_id],
                )
                .map_err(|e| e.to_string())?;
            } else {
                conn.execute("DELETE FROM conversations WHERE session_id IS NULL", [])
                    .map_err(|e| e.to_string())?;
            }
            Ok(Some(Value::Null))
        }
        "db:chat-sessions-list" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let mut stmt = conn.prepare("SELECT id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |r| Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "createdAt": r.get::<_, i64>(2)?, "updatedAt": r.get::<_, i64>(3)? }))).map_err(|e| e.to_string())?;
            Ok(Some(Value::Array(rows.filter_map(Result::ok).collect())))
        }
        "db:chat-session-create" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            conn.execute("INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?1, ?2, unixepoch(), unixepoch())", params![as_str(&params, "id")?, as_str(&params, "title")?]).map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "db:chat-session-delete" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            conn.execute(
                "DELETE FROM conversations WHERE session_id = ?1",
                params![as_str(&params, "sessionId")?],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "DELETE FROM chat_sessions WHERE id = ?1",
                params![as_str(&params, "sessionId")?],
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "db:chat-session-rename" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            conn.execute(
                "UPDATE chat_sessions SET title = ?1, updated_at = unixepoch() WHERE id = ?2",
                params![as_str(&params, "title")?, as_str(&params, "sessionId")?],
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "db:semantic-search" => {
            let vault = as_str(&params, "vaultPath")?;
            let query = as_str(&params, "query")?;
            let query_terms = terms(query);
            let conn = connection(vault)?;
            let mut stmt = conn
                .prepare(
                    r#"
                    SELECT n.id, n.title, n.file_path, c.content
                    FROM chunks c
                    JOIN notes n ON n.id = c.note_id
                    "#,
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            let mut results = rows
                .filter_map(Result::ok)
                .filter_map(|(note_id, title, file_path, chunk)| {
                    let score = lexical_score(&query_terms, &format!("{title}\n{chunk}"));
                    (score > 0.0).then(|| {
                        json!({ "noteId": note_id, "title": title, "filePath": file_path, "chunk": chunk, "score": score })
                    })
                })
                .collect::<Vec<_>>();
            results.sort_by(|a, b| {
                b.get("score")
                    .and_then(Value::as_f64)
                    .partial_cmp(&a.get("score").and_then(Value::as_f64))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            results.truncate(10);
            Ok(Some(Value::Array(results)))
        }
        "db:embedding-status" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let total: i64 = conn
                .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
                .unwrap_or(0);
            let embedded: i64 = conn
                .query_row("SELECT COUNT(DISTINCT note_id) FROM chunks", [], |r| {
                    r.get(0)
                })
                .unwrap_or(0);
            let state = if total > 0 && embedded >= total {
                "done"
            } else {
                "idle"
            };
            Ok(Some(
                json!({ "state": state, "current": embedded, "total": total, "embedded": embedded, "updatedAt": chrono::Utc::now().timestamp_millis() }),
            ))
        }
        "db:embed-note" => {
            let conn = connection(as_str(&params, "vaultPath")?)?;
            let note_id = as_str(&params, "noteId")?;
            let content = as_str(&params, "content")?;
            index_note_chunks(&conn, note_id, content, "tauri-lexical")?;
            Ok(Some(Value::Null))
        }
        "db:embed-vault" => {
            let vault = as_str(&params, "vaultPath")?;
            let mut conn = connection(vault)?;
            for file in collect_markdown_files(vault) {
                index_note(&mut conn, vault, &file)?;
            }
            let mut stmt = conn
                .prepare("SELECT id, file_path FROM notes")
                .map_err(|e| e.to_string())?;
            let notes = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect::<Vec<_>>();
            let mut embedded = 0;
            for (note_id, file_path) in notes {
                let content =
                    fs::read_to_string(Path::new(vault).join(&file_path)).unwrap_or_default();
                if index_note_chunks(&conn, &note_id, &content, "tauri-lexical")? > 0 {
                    embedded += 1;
                }
            }
            Ok(Some(json!({ "embedded": embedded })))
        }
        _ => Ok(None),
    }
}

fn regex_search(vault: &str, query: &str) -> Result<Value, String> {
    let re = Regex::new(query).map_err(|_| "invalid regex".to_string())?;
    let mut results = Vec::new();
    for file in collect_markdown_files(vault) {
        let content = fs::read_to_string(&file).unwrap_or_default();
        let rel = rel_path(vault, &file)?;
        let title = content
            .lines()
            .find_map(|l| l.strip_prefix("# ").map(str::trim))
            .unwrap_or_else(|| file.file_stem().and_then(|s| s.to_str()).unwrap_or(&rel));
        for (i, line) in content.lines().enumerate() {
            if re.is_match(line) {
                results.push(json!({ "filePath": rel, "title": title, "line": line.trim(), "lineNumber": i + 1 }));
                if results.len() >= 50 {
                    return Ok(Value::Array(results));
                }
            }
        }
    }
    Ok(Value::Array(results))
}

fn get_kanban_tasks(vault: &str) -> Result<Value, String> {
    let conn = connection(vault)?;
    let mut stmt = conn
        .prepare(
            r#"
    SELECT kt.id, kt.column_id, kt.title, kt.description, kt.sort_order, kt.priority, kt.due_date,
           kt.source_note_id, kt.source_file_path, n.title, kt.created_at, kt.updated_at
    FROM kanban_tasks kt
    LEFT JOIN notes n ON n.id = kt.source_note_id
    ORDER BY kt.column_id, kt.sort_order ASC
    "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
              "id": r.get::<_, String>(0)?,
              "columnId": r.get::<_, String>(1)?,
              "title": r.get::<_, String>(2)?,
              "description": r.get::<_, String>(3)?,
              "sortOrder": r.get::<_, i64>(4)?,
              "priority": r.get::<_, i64>(5)?,
              "dueDate": r.get::<_, Option<String>>(6)?,
              "sourceNoteId": r.get::<_, Option<String>>(7)?,
              "sourceFilePath": r.get::<_, Option<String>>(8)?,
              "sourceTitle": r.get::<_, Option<String>>(9)?,
              "createdAt": r.get::<_, i64>(10)?,
              "updatedAt": r.get::<_, i64>(11)?
            }))
        })
        .map_err(|e| e.to_string())?;
    Ok(Value::Array(rows.filter_map(Result::ok).collect()))
}

fn chat_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let sources_raw: Option<String> = r.get(3)?;
    let sources = sources_raw
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
        .unwrap_or(Value::Null);
    Ok(json!({
      "id": r.get::<_, i64>(0)?.to_string(),
      "role": r.get::<_, String>(1)?,
      "content": r.get::<_, String>(2)?,
      "sources": sources
    }))
}

fn get_graph(vault: &str) -> Result<Value, String> {
    let conn = connection(vault)?;
    let mut stmt = conn
        .prepare("SELECT id, title, file_path FROM notes")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let notes: Vec<(String, String, String)> = rows.filter_map(Result::ok).collect();
    let note_ids: HashSet<String> = notes.iter().map(|n| n.0.clone()).collect();
    let mut title_to_id = HashMap::new();
    let mut ambiguous = HashSet::new();
    for (id, title, file_path) in &notes {
        for key in [
            title.clone(),
            Path::new(file_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(title)
                .to_string(),
        ] {
            if title_to_id.contains_key(&key) && title_to_id.get(&key) != Some(id) {
                ambiguous.insert(key);
            } else {
                title_to_id.insert(key, id.clone());
            }
        }
    }
    for key in ambiguous {
        title_to_id.remove(&key);
    }

    let mut link_stmt = conn
        .prepare("SELECT source_note_id, target_note_id, target_title FROM links")
        .map_err(|e| e.to_string())?;
    let links = link_stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut edge_set = HashSet::new();
    let mut edges = Vec::new();
    for link in links.filter_map(Result::ok) {
        let target = link
            .1
            .filter(|id| note_ids.contains(id))
            .or_else(|| title_to_id.get(&link.2).cloned());
        if let Some(target) = target.filter(|target| target != &link.0) {
            let key = format!("{}->{target}", link.0);
            if edge_set.insert(key) {
                edges.push(json!({ "source": link.0, "target": target }));
            }
        }
    }

    let mut folder_map = HashMap::new();
    for (_, _, file_path) in &notes {
        if let Some(parent) = Path::new(file_path)
            .parent()
            .and_then(|p| p.to_str())
            .filter(|p| !p.is_empty())
        {
            folder_map
                .entry(parent.to_string())
                .or_insert_with(|| format!("folder:{parent}"));
        }
    }
    let mut nodes = Vec::new();
    for (path, id) in &folder_map {
        let title = Path::new(path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(path);
        nodes.push(json!({ "id": id, "title": title, "filePath": path, "type": "folder" }));
    }
    for (id, title, file_path) in &notes {
        if let Some(parent) = Path::new(file_path)
            .parent()
            .and_then(|p| p.to_str())
            .filter(|p| !p.is_empty())
        {
            if let Some(folder_id) = folder_map.get(parent) {
                edges.push(json!({ "source": folder_id, "target": id }));
            }
        }
        nodes.push(json!({ "id": id, "title": title, "filePath": file_path, "type": "file" }));
    }
    Ok(json!({ "nodes": nodes, "edges": edges }))
}

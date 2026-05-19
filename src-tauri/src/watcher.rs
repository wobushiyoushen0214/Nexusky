use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

static WATCH_GENERATION: AtomicU64 = AtomicU64::new(0);
static CURRENT_WATCH: Mutex<Option<String>> = Mutex::new(None);

#[derive(Clone, Copy, PartialEq, Eq)]
struct EntryState {
    is_dir: bool,
    mtime_ms: u128,
    len: u64,
}

fn ignored(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.') || name == "node_modules")
        .unwrap_or(false)
}

fn entry_state(path: &Path, is_dir: bool) -> Option<EntryState> {
    let metadata = fs::metadata(path).ok()?;
    let mtime_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    Some(EntryState {
        is_dir,
        mtime_ms,
        len: if is_dir { 0 } else { metadata.len() },
    })
}

fn collect_snapshot(root: &Path, snapshot: &mut HashMap<PathBuf, EntryState>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if ignored(&path) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.is_dir() {
            if let Some(state) = entry_state(&path, true) {
                snapshot.insert(path.clone(), state);
            }
            collect_snapshot(&path, snapshot);
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
            if let Some(state) = entry_state(&path, false) {
                snapshot.insert(path, state);
            }
        }
    }
}

fn snapshot(root: &Path) -> HashMap<PathBuf, EntryState> {
    let mut result = HashMap::new();
    collect_snapshot(root, &mut result);
    result
}

fn index_file(vault_path: &str, file_path: &Path) {
    let _ = crate::db::handle(
        None,
        "db:index-file",
        json!({
            "vaultPath": vault_path,
            "filePath": file_path.to_string_lossy()
        }),
    );
}

fn remove_file(vault_path: &str, file_path: &Path) {
    let _ = crate::db::handle(
        None,
        "db:remove-file",
        json!({
            "vaultPath": vault_path,
            "filePath": file_path.to_string_lossy()
        }),
    );
}

pub fn start_watching(app: AppHandle, vault_path: String) {
    if let Ok(mut current) = CURRENT_WATCH.lock() {
        if current.as_deref() == Some(vault_path.as_str()) {
            return;
        }
        *current = Some(vault_path.clone());
    }

    let generation = WATCH_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    thread::spawn(move || {
        let root = PathBuf::from(&vault_path);
        let mut previous = snapshot(&root);

        loop {
            thread::sleep(Duration::from_millis(900));
            if WATCH_GENERATION.load(Ordering::SeqCst) != generation {
                break;
            }

            let current = snapshot(&root);
            let mut structure_changed = false;

            for (path, state) in &current {
                match previous.get(path) {
                    None => {
                        structure_changed = true;
                        if !state.is_dir {
                            index_file(&vault_path, path);
                            let _ = app.emit("file:changed", path.to_string_lossy().to_string());
                        }
                    }
                    Some(prev) if prev != state && !state.is_dir => {
                        index_file(&vault_path, path);
                        let _ = app.emit("file:changed", path.to_string_lossy().to_string());
                    }
                    _ => {}
                }
            }

            for (path, state) in &previous {
                if !current.contains_key(path) {
                    structure_changed = true;
                    if !state.is_dir {
                        remove_file(&vault_path, path);
                    }
                }
            }

            if structure_changed {
                let _ = app.emit("vault:files-changed", json!({}));
            }

            previous = current;
        }
    });
}

pub fn stop_watching() {
    if let Ok(mut current) = CURRENT_WATCH.lock() {
        *current = None;
    }
    WATCH_GENERATION.fetch_add(1, Ordering::SeqCst);
}

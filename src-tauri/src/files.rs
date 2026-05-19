use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::Engine;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

const ENCRYPTED_MARKER: &str = "---encrypted---\n";

fn as_str<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("missing {key}"))
}

fn path_safe(file_path: &Path, vault_path: Option<&str>) -> bool {
    let Some(vault_path) = vault_path else {
        return true;
    };
    let Ok(file) = file_path
        .canonicalize()
        .or_else(|_| Ok::<PathBuf, std::io::Error>(file_path.to_path_buf()))
    else {
        return false;
    };
    let Ok(vault) = Path::new(vault_path).canonicalize() else {
        return false;
    };
    file.starts_with(vault)
}

fn mtime_ms(path: &Path) -> f64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

fn derive_note_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let params = scrypt::Params::new(14, 8, 1, 32).map_err(|e| e.to_string())?;
    let mut key = [0_u8; 32];
    scrypt::scrypt(password.as_bytes(), salt, &params, &mut key).map_err(|e| e.to_string())?;
    Ok(key)
}

fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .arg("-R")
        .arg(path)
        .status()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let status = Command::new("explorer")
        .arg(format!("/select,{}", path.to_string_lossy()))
        .status()
        .map_err(|e| e.to_string())?;

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(path.parent().unwrap_or_else(|| Path::new(".")))
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("无法在文件管理器中显示该文件".into())
    }
}

pub fn list_directory(dir_path: &Path, recursive: bool) -> Result<Value, String> {
    let mut entries_json = Vec::new();
    let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        let path = entry.path();
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        if metadata.is_dir() {
            let children = if recursive {
                list_directory(&path, true)?
            } else {
                json!([])
            };
            entries_json.push(json!({
              "name": name,
              "path": path.to_string_lossy(),
              "isDirectory": true,
              "children": children,
              "mtime": mtime_ms(&path)
            }));
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            entries_json.push(json!({
              "name": name,
              "path": path.to_string_lossy(),
              "isDirectory": false,
              "mtime": mtime_ms(&path)
            }));
        }
    }

    entries_json.sort_by(|a, b| {
        let ad = a
            .get("isDirectory")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let bd = b
            .get("isDirectory")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if ad != bd {
            return bd.cmp(&ad);
        }
        let an = a.get("name").and_then(Value::as_str).unwrap_or("");
        let bn = b.get("name").and_then(Value::as_str).unwrap_or("");
        an.cmp(bn)
    });

    Ok(Value::Array(entries_json))
}

fn save_snapshot(file_path: &Path, vault_path: &Path) {
    let Ok(content) = fs::read_to_string(file_path) else {
        return;
    };
    let Ok(rel_path) = file_path.strip_prefix(vault_path) else {
        return;
    };
    let history_dir = vault_path
        .join(".history")
        .join(rel_path.parent().unwrap_or_else(|| Path::new("")));
    if fs::create_dir_all(&history_dir).is_err() {
        return;
    }
    let name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("note");
    let mut snapshots: Vec<_> = fs::read_dir(&history_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|e| {
            let file_name = e.file_name().to_string_lossy().to_string();
            file_name.starts_with(&format!("{name}_")) && file_name.ends_with(".md")
        })
        .collect();
    snapshots.sort_by_key(|e| e.file_name());

    if let Some(latest) = snapshots.last() {
        if fs::read_to_string(latest.path()).ok().as_deref() == Some(content.as_str()) {
            return;
        }
    }

    let ts = chrono::Utc::now().to_rfc3339().replace([':', '.'], "-");
    let _ = fs::write(history_dir.join(format!("{name}_{ts}.md")), content);

    if snapshots.len() >= 50 {
        let delete_count = snapshots.len().saturating_sub(49);
        for entry in snapshots.into_iter().take(delete_count) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

pub fn handle(channel: &str, params: Value) -> Result<Option<Value>, String> {
    match channel {
        "file:read" => Ok(Some(Value::String(
            fs::read_to_string(as_str(&params, "path")?).map_err(|e| e.to_string())?,
        ))),
        "file:stat" => {
            let path = Path::new(as_str(&params, "path")?);
            let stat = fs::metadata(path).map_err(|e| e.to_string())?;
            Ok(Some(json!({ "size": stat.len(), "mtime": mtime_ms(path) })))
        }
        "file:write" => {
            let path = Path::new(as_str(&params, "path")?);
            let vault_path = params.get("vaultPath").and_then(Value::as_str);
            if !path_safe(path, vault_path) {
                return Err("路径不在当前笔记空间内".into());
            }
            if let Some(vault) =
                vault_path.filter(|_| path.extension().and_then(|e| e.to_str()) == Some("md"))
            {
                save_snapshot(path, Path::new(vault));
            }
            fs::write(path, as_str(&params, "content")?).map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "file:list" => Ok(Some(list_directory(
            Path::new(as_str(&params, "dirPath")?),
            true,
        )?)),
        "file:list-shallow" => Ok(Some(list_directory(
            Path::new(as_str(&params, "dirPath")?),
            false,
        )?)),
        "file:create" => {
            let path = Path::new(as_str(&params, "path")?);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(
                path,
                params.get("content").and_then(Value::as_str).unwrap_or(""),
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "file:reveal" => {
            reveal_in_file_manager(Path::new(as_str(&params, "path")?))?;
            Ok(Some(Value::Null))
        }
        "file:delete" => {
            let path = Path::new(as_str(&params, "path")?);
            let vault_path = params.get("vaultPath").and_then(Value::as_str);
            if !path_safe(path, vault_path) {
                return Err("路径不在当前笔记空间内".into());
            }
            if let Some(vault) = vault_path {
                let trash_dir = Path::new(vault).join(".trash");
                fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
                let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("file");
                let trash_path = trash_dir.join(format!(
                    "{}_{}",
                    chrono::Utc::now().timestamp_millis(),
                    file_name
                ));
                fs::rename(path, trash_path).map_err(|e| e.to_string())?;
            } else if path.is_dir() {
                fs::remove_dir_all(path).map_err(|e| e.to_string())?;
            } else {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
            Ok(Some(Value::Null))
        }
        "file:rename" => {
            let old_path = Path::new(as_str(&params, "oldPath")?);
            let new_path = Path::new(as_str(&params, "newPath")?);
            if let Some(parent) = new_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "file:save-image" => {
            let vault_path = Path::new(as_str(&params, "vaultPath")?);
            let file_name = as_str(&params, "fileName")?;
            let assets_dir = vault_path.join("assets");
            fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
            let image_data = as_str(&params, "imageData")?;
            let base64_data = image_data
                .split_once(',')
                .map(|(_, data)| data)
                .unwrap_or(image_data);
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(base64_data)
                .map_err(|e| e.to_string())?;
            fs::write(assets_dir.join(file_name), bytes).map_err(|e| e.to_string())?;
            Ok(Some(Value::String(format!("assets/{file_name}"))))
        }
        "file:get-history" => {
            let vault_path = Path::new(as_str(&params, "vaultPath")?);
            let file_path = Path::new(as_str(&params, "filePath")?);
            let rel = file_path
                .strip_prefix(vault_path)
                .map_err(|e| e.to_string())?;
            let history_dir = vault_path
                .join(".history")
                .join(rel.parent().unwrap_or_else(|| Path::new("")));
            let name = file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let mut snapshots = Vec::new();
            if let Ok(entries) = fs::read_dir(history_dir) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.starts_with(&format!("{name}_")) && file_name.ends_with(".md") {
                        snapshots.push(json!({ "fileName": file_name, "path": entry.path().to_string_lossy(), "timestamp": "" }));
                    }
                }
            }
            snapshots.sort_by(|a, b| {
                b.get("fileName")
                    .and_then(Value::as_str)
                    .cmp(&a.get("fileName").and_then(Value::as_str))
            });
            snapshots.truncate(30);
            Ok(Some(Value::Array(snapshots)))
        }
        "file:restore-history" => {
            let content =
                fs::read_to_string(as_str(&params, "snapshotPath")?).map_err(|e| e.to_string())?;
            fs::write(as_str(&params, "targetPath")?, content).map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "file:encrypt" => {
            let path = Path::new(as_str(&params, "path")?);
            let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
            let mut salt = [0_u8; 16];
            let mut iv = [0_u8; 12];
            getrandom::getrandom(&mut salt).map_err(|e| e.to_string())?;
            getrandom::getrandom(&mut iv).map_err(|e| e.to_string())?;

            let key = derive_note_key(as_str(&params, "password")?, &salt)?;
            let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
            let encrypted_with_tag = cipher
                .encrypt(Nonce::from_slice(&iv), content.as_bytes())
                .map_err(|e| e.to_string())?;
            let tag_start = encrypted_with_tag
                .len()
                .checked_sub(16)
                .ok_or_else(|| "加密失败".to_string())?;
            let (encrypted, tag) = encrypted_with_tag.split_at(tag_start);

            let mut payload = Vec::with_capacity(44 + encrypted.len());
            payload.extend_from_slice(&salt);
            payload.extend_from_slice(&iv);
            payload.extend_from_slice(tag);
            payload.extend_from_slice(encrypted);
            let encoded = base64::engine::general_purpose::STANDARD.encode(payload);
            fs::write(path, format!("{ENCRYPTED_MARKER}{encoded}")).map_err(|e| e.to_string())?;
            Ok(Some(Value::Bool(true)))
        }
        "file:decrypt" => {
            let raw = fs::read_to_string(as_str(&params, "path")?).map_err(|e| e.to_string())?;
            if !raw.starts_with(ENCRYPTED_MARKER) {
                return Ok(Some(json!({ "success": false, "error": "文件未加密" })));
            }

            let result = (|| -> Result<String, String> {
                let payload = base64::engine::general_purpose::STANDARD
                    .decode(&raw[ENCRYPTED_MARKER.len()..])
                    .map_err(|e| e.to_string())?;
                if payload.len() < 44 {
                    return Err("加密内容损坏".into());
                }
                let salt = &payload[0..16];
                let iv = &payload[16..28];
                let tag = &payload[28..44];
                let encrypted = &payload[44..];
                let key = derive_note_key(as_str(&params, "password")?, salt)?;
                let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
                let mut encrypted_with_tag = Vec::with_capacity(encrypted.len() + tag.len());
                encrypted_with_tag.extend_from_slice(encrypted);
                encrypted_with_tag.extend_from_slice(tag);
                let decrypted = cipher
                    .decrypt(Nonce::from_slice(iv), encrypted_with_tag.as_ref())
                    .map_err(|e| e.to_string())?;
                String::from_utf8(decrypted).map_err(|e| e.to_string())
            })();

            match result {
                Ok(content) => Ok(Some(json!({ "success": true, "content": content }))),
                Err(_) => Ok(Some(json!({ "success": false, "error": "密码错误" }))),
            }
        }
        "file:list-trash" => {
            let trash_dir = Path::new(as_str(&params, "vaultPath")?).join(".trash");
            let mut items = Vec::new();
            if let Ok(entries) = fs::read_dir(trash_dir) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.ends_with(".md") {
                        let original_name = file_name
                            .split_once('_')
                            .map(|(_, s)| s)
                            .unwrap_or(&file_name)
                            .to_string();
                        items.push(json!({ "fileName": file_name, "originalName": original_name, "path": entry.path().to_string_lossy() }));
                    }
                }
            }
            items.sort_by(|a, b| {
                b.get("fileName")
                    .and_then(Value::as_str)
                    .cmp(&a.get("fileName").and_then(Value::as_str))
            });
            Ok(Some(Value::Array(items)))
        }
        "file:restore-trash" => {
            let trash_path = Path::new(as_str(&params, "trashPath")?);
            let file_name = trash_path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let original_name = file_name
                .split_once('_')
                .map(|(_, s)| s)
                .unwrap_or(file_name);
            let dest = Path::new(as_str(&params, "vaultPath")?).join(original_name);
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::rename(trash_path, dest).map_err(|e| e.to_string())?;
            Ok(Some(Value::Null))
        }
        "file:empty-trash" => {
            let trash_dir = Path::new(as_str(&params, "vaultPath")?).join(".trash");
            if trash_dir.exists() {
                fs::remove_dir_all(trash_dir).map_err(|e| e.to_string())?;
            }
            Ok(Some(Value::Null))
        }
        "file:import-obsidian" => {
            let mut imported = 0;
            let mut converted = 0;
            import_obsidian_dir(
                Path::new(as_str(&params, "sourcePath")?),
                Path::new(as_str(&params, "vaultPath")?),
                &mut imported,
                &mut converted,
            )?;
            Ok(Some(
                json!({ "imported": imported, "converted": converted }),
            ))
        }
        _ => Ok(None),
    }
}

fn import_obsidian_dir(
    src: &Path,
    dest: &Path,
    imported: &mut i64,
    converted: &mut i64,
) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let src_path = entry.path();
        let dest_path = dest.join(&name);
        if src_path.is_dir() {
            import_obsidian_dir(&src_path, &dest_path, imported, converted)?;
        } else if src_path.extension().and_then(|e| e.to_str()) == Some("md") {
            let raw = fs::read_to_string(&src_path).map_err(|e| e.to_string())?;
            let mut did_convert = false;
            let content = raw
                .lines()
                .map(|line| {
                    if let Some(rest) = line.strip_prefix("> [!") {
                        if let Some((kind, title)) = rest.split_once(']') {
                            did_convert = true;
                            let title = title.trim();
                            return format!(
                                "> **{}{}**",
                                capitalize(kind),
                                if title.is_empty() {
                                    String::new()
                                } else {
                                    format!(": {title}")
                                }
                            );
                        }
                    }
                    line.to_string()
                })
                .collect::<Vec<_>>()
                .join("\n");
            fs::write(dest_path, content).map_err(|e| e.to_string())?;
            *imported += 1;
            if did_convert {
                *converted += 1;
            }
        } else {
            fs::copy(src_path, dest_path).map_err(|e| e.to_string())?;
            *imported += 1;
        }
    }
    Ok(())
}

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_note_path(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("nexusky-{name}-{timestamp}.md"))
    }

    #[test]
    fn encrypt_and_decrypt_note_payloads() {
        let path = temp_note_path("encrypted-note");
        fs::write(&path, "hello encrypted note").expect("write temp note");

        let encrypted = handle(
            "file:encrypt",
            json!({ "path": path.to_string_lossy(), "password": "secret" }),
        )
        .expect("encrypt should not error")
        .expect("encrypt should return value");
        assert_eq!(encrypted, Value::Bool(true));

        let raw = fs::read_to_string(&path).expect("read encrypted note");
        assert!(raw.starts_with(ENCRYPTED_MARKER));

        let wrong_password = handle(
            "file:decrypt",
            json!({ "path": path.to_string_lossy(), "password": "wrong" }),
        )
        .expect("wrong password should return structured result")
        .expect("decrypt should return value");
        assert_eq!(wrong_password["success"], Value::Bool(false));

        let decrypted = handle(
            "file:decrypt",
            json!({ "path": path.to_string_lossy(), "password": "secret" }),
        )
        .expect("decrypt should not error")
        .expect("decrypt should return value");
        assert_eq!(decrypted["success"], Value::Bool(true));
        assert_eq!(
            decrypted["content"],
            Value::String("hello encrypted note".into())
        );

        let _ = fs::remove_file(path);
    }
}

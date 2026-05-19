use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

fn config_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or_else(|| "无法定位用户配置目录".to_string())?;
    let dir = base.join("Nexusky");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn read_config() -> Value {
    config_path()
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_config(config: &Value) -> Result<(), String> {
    fs::write(
        config_path()?,
        serde_json::to_string_pretty(config).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn add_recent(config: &mut Value, vault_path: &str) {
    let existing = config
        .get("recentVaults")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut recent = vec![Value::String(vault_path.to_string())];
    for item in existing {
        if item.as_str() != Some(vault_path) && recent.len() < 8 {
            recent.push(item);
        }
    }
    config["recentVaults"] = Value::Array(recent);
}

pub fn handle(channel: &str, params: Value) -> Result<Option<Value>, String> {
    match channel {
        "vault:select" => {
            let Some(path) = rfd::FileDialog::new()
                .set_title("选择笔记库目录")
                .pick_folder()
            else {
                return Ok(Some(Value::Null));
            };
            let vault_path = path.to_string_lossy().to_string();
            let mut config = read_config();
            config["vaultPath"] = Value::String(vault_path.clone());
            add_recent(&mut config, &vault_path);
            write_config(&config)?;
            Ok(Some(Value::String(vault_path)))
        }
        "vault:create" => {
            let Some(parent) = rfd::FileDialog::new()
                .set_title("选择笔记库存放位置")
                .pick_folder()
            else {
                return Ok(Some(Value::Null));
            };
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| "missing name".to_string())?;
            let vault = parent.join(name);
            fs::create_dir_all(&vault).map_err(|e| e.to_string())?;
            let welcome = format!("# 欢迎使用 Nexusky\n\n这是你的新笔记空间「{name}」。\n\n开始写下你的第一篇笔记吧。\n");
            fs::write(vault.join("欢迎.md"), welcome).map_err(|e| e.to_string())?;
            let vault_path = vault.to_string_lossy().to_string();
            let mut config = read_config();
            config["vaultPath"] = Value::String(vault_path.clone());
            add_recent(&mut config, &vault_path);
            write_config(&config)?;
            Ok(Some(Value::String(vault_path)))
        }
        "vault:get" => {
            let config = read_config();
            Ok(Some(
                config.get("vaultPath").cloned().unwrap_or(Value::Null),
            ))
        }
        "vault:get-recent" => {
            let config = read_config();
            Ok(Some(
                config
                    .get("recentVaults")
                    .cloned()
                    .unwrap_or_else(|| json!([])),
            ))
        }
        "vault:clear-current" => {
            let mut config = read_config();
            config["vaultPath"] = Value::Null;
            write_config(&config)?;
            Ok(Some(Value::Null))
        }
        _ => Ok(None),
    }
}

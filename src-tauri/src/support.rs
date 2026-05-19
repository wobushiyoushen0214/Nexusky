use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::process::Command;

fn config_path() -> Result<std::path::PathBuf, String> {
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

fn get_config(key: &str, fallback: Value) -> Value {
    read_config().get(key).cloned().unwrap_or(fallback)
}

fn set_config(key: &str, value: Value) -> Result<(), String> {
    let mut config = read_config();
    config[key] = value;
    write_config(&config)
}

fn as_str<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("missing {key}"))
}

fn default_templates() -> Value {
    json!([
      { "id": "blank", "name": "空白笔记", "content": "# {{title}}\n\n" },
      { "id": "meeting", "name": "会议记录", "content": "# {{title}}\n\n**日期**: {{date}}\n**参与者**: \n\n## 议题\n\n- \n\n## 决议\n\n- \n\n## 待办\n\n- [ ] \n" },
      { "id": "reading", "name": "读书笔记", "content": "# {{title}}\n\n**作者**: \n**评分**: ⭐⭐⭐⭐⭐\n\n## 核心观点\n\n- \n\n## 摘录\n\n> \n\n## 感想\n\n" },
      { "id": "project", "name": "项目文档", "content": "# {{title}}\n\n## 目标\n\n\n\n## 技术方案\n\n\n\n## 进度\n\n- [ ] \n\n## 参考\n\n- \n" }
    ])
}

fn open_external(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.arg("/C").arg("start");
        c
    };
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut cmd = Command::new("xdg-open");

    cmd.arg(url).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn handle(channel: &str, params: Value) -> Result<Option<Value>, String> {
    match channel {
        "app:get-version" => Ok(Some(Value::String(env!("CARGO_PKG_VERSION").to_string()))),
        "app:open-external" => {
            open_external(as_str(&params, "url")?)?;
            Ok(Some(Value::Null))
        }
        "template:daily-note" => {
            let vault = Path::new(as_str(&params, "vaultPath")?);
            let date = chrono::Local::now().format("%Y-%m-%d").to_string();
            let daily_dir = vault.join("daily");
            let file_path = daily_dir.join(format!("{date}.md"));
            if !file_path.exists() {
                fs::create_dir_all(&daily_dir).map_err(|e| e.to_string())?;
                let content = get_config("dailyTemplate", Value::Null)
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("# {date}\n\n## 今日计划\n\n- \n\n## 笔记\n\n"));
                fs::write(&file_path, content).map_err(|e| e.to_string())?;
            }
            Ok(Some(Value::String(file_path.to_string_lossy().to_string())))
        }
        "template:get-templates" => Ok(Some(get_config("templates", default_templates()))),
        "template:save-templates" => {
            set_config(
                "templates",
                params
                    .get("templates")
                    .cloned()
                    .unwrap_or_else(|| json!([])),
            )?;
            Ok(Some(Value::Null))
        }
        "template:create-from" => {
            let templates = get_config("templates", default_templates());
            let template_id = as_str(&params, "templateId")?;
            let title = as_str(&params, "title")?;
            let Some(template) = templates.as_array().and_then(|items| {
                items
                    .iter()
                    .find(|t| t.get("id").and_then(Value::as_str) == Some(template_id))
            }) else {
                return Ok(Some(Value::Null));
            };
            let content = template
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or("# {{title}}\n\n")
                .replace("{{title}}", title)
                .replace(
                    "{{date}}",
                    &chrono::Local::now().format("%Y-%m-%d").to_string(),
                );
            let file_path = Path::new(as_str(&params, "vaultPath")?).join(format!("{title}.md"));
            if let Some(parent) = file_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(&file_path, content).map_err(|e| e.to_string())?;
            Ok(Some(Value::String(file_path.to_string_lossy().to_string())))
        }
        "ai:get-providers" => Ok(Some(get_config("aiProviders", json!([])))),
        "ai:save-providers" => {
            set_config(
                "aiProviders",
                params
                    .get("providers")
                    .cloned()
                    .unwrap_or_else(|| json!([])),
            )?;
            Ok(Some(Value::Null))
        }
        "ai:set-active" => {
            set_config(
                "activeAIProvider",
                Value::String(as_str(&params, "providerId")?.to_string()),
            )?;
            Ok(Some(Value::Null))
        }
        "ai:get-active-provider" => Ok(Some(get_config("activeAIProvider", Value::Null))),
        "ai:get-system-prompt" => Ok(Some(get_config(
            "systemPrompt",
            Value::String(String::new()),
        ))),
        "ai:set-system-prompt" => {
            set_config(
                "systemPrompt",
                Value::String(as_str(&params, "prompt")?.to_string()),
            )?;
            Ok(Some(Value::Null))
        }
        "ai:validate" => Ok(Some(json!({ "ok": true }))),
        "ai:detect-local-config" => Ok(Some(
            json!({ "skipped": ["Tauri local config detection is not migrated yet"] }),
        )),
        "ai:list-ollama-models" => Ok(Some(json!([]))),
        "cloud:get-config" => Ok(Some(get_config(
            "cloudConfig",
            json!({ "supabaseUrl": "", "supabaseKey": "", "serviceRoleKey": "", "enabled": false }),
        ))),
        "cloud:save-config" => {
            set_config(
                "cloudConfig",
                params.get("config").cloned().unwrap_or_else(|| json!({})),
            )?;
            Ok(Some(Value::Null))
        }
        "cloud:get-user" => Ok(Some(Value::Null)),
        "cloud:sign-out" | "cloud:set-online" => Ok(Some(Value::Null)),
        "cloud:init" | "cloud:sign-in" | "cloud:sign-up" | "cloud:onedrive-auth" => Ok(Some(
            json!({ "success": false, "error": "Tauri cloud auth is not migrated yet" }),
        )),
        "cloud:sync" | "cloud:pull-all" => Ok(Some(
            json!({ "total": 0, "pushed": 0, "pulled": 0, "conflicts": [], "errors": ["Tauri cloud sync is not migrated yet"] }),
        )),
        "cloud:push-file" | "cloud:pull-file" | "cloud:push-index" | "cloud:pull-index" => {
            Ok(Some(Value::Bool(false)))
        }
        "cloud:sync-index" => Ok(Some(json!({ "pushed": false, "pulled": false }))),
        "cloud:get-sync-provider" => Ok(Some(get_config(
            "syncProvider",
            Value::String("supabase".into()),
        ))),
        "cloud:set-sync-provider" => {
            set_config(
                "syncProvider",
                Value::String(as_str(&params, "provider")?.to_string()),
            )?;
            Ok(Some(Value::Null))
        }
        "cloud:get-all-providers" => Ok(Some(json!([
          { "type": "supabase", "name": "Supabase", "configured": false },
          { "type": "icloud", "name": "iCloud Drive", "configured": get_config("icloudPath", Value::Null).is_string() },
          { "type": "onedrive", "name": "OneDrive", "configured": get_config("onedriveConfig", Value::Null).is_object() }
        ]))),
        "cloud:test-connection" => Ok(Some(
            json!({ "ok": false, "error": "Tauri cloud provider is not migrated yet" }),
        )),
        "cloud:get-onedrive-config" => Ok(Some(get_config("onedriveConfig", Value::Null))),
        "cloud:save-onedrive-config" => {
            set_config("onedriveConfig", params)?;
            Ok(Some(Value::Null))
        }
        "cloud:get-icloud-path" => Ok(Some(get_config("icloudPath", Value::Null))),
        "cloud:set-icloud-path" => {
            set_config(
                "icloudPath",
                Value::String(as_str(&params, "path")?.to_string()),
            )?;
            Ok(Some(Value::Null))
        }
        "cloud:get-sync-exclude" => Ok(Some(get_config("syncExclude", json!([])))),
        "cloud:set-sync-exclude" => {
            set_config(
                "syncExclude",
                params.get("paths").cloned().unwrap_or_else(|| json!([])),
            )?;
            Ok(Some(Value::Null))
        }
        "updater:check" => Ok(Some(json!({ "available": false }))),
        "updater:download" | "updater:install" => Ok(Some(Value::Null)),
        "export:html" | "export:pdf" => Ok(Some(Value::Bool(false))),
        "export:share" => Ok(Some(String::new().into())),
        _ => Ok(None),
    }
}

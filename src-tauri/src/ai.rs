use serde_json::{json, Value};
use std::fs;
use tauri::{AppHandle, Emitter};

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

fn active_provider() -> Option<Value> {
  let config = read_config();
  let providers = config.get("aiProviders")?.as_array()?;
  let active = config.get("activeAIProvider").and_then(Value::as_str);
  providers
    .iter()
    .find(|p| active.is_some() && p.get("id").and_then(Value::as_str) == active)
    .or_else(|| providers.iter().find(|p| p.get("enabled").and_then(Value::as_bool).unwrap_or(true)))
    .cloned()
}

fn message_text(content: &Value) -> String {
  if let Some(text) = content.as_str() {
    return text.to_string();
  }
  content.as_array().map(|parts| {
    parts.iter()
      .filter_map(|part| part.get("text").and_then(Value::as_str))
      .collect::<Vec<_>>()
      .join("\n")
  }).unwrap_or_default()
}

fn normalize_messages(messages: &[Value]) -> Vec<Value> {
  messages.iter().filter_map(|m| {
    let role = m.get("role").and_then(Value::as_str).unwrap_or("user");
    if role == "system" {
      return None;
    }
    Some(json!({ "role": role, "content": message_text(m.get("content").unwrap_or(&Value::Null)) }))
  }).collect()
}

fn provider_field(provider: &Value, key: &str) -> String {
  provider.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

fn base_url(provider: &Value) -> String {
  let raw = provider_field(provider, "baseUrl");
  if raw.trim().is_empty() {
    match provider.get("type").and_then(Value::as_str).unwrap_or("openai") {
      "claude" => "https://api.anthropic.com".into(),
      "ollama" => "http://127.0.0.1:11434/v1".into(),
      _ => "https://api.openai.com/v1".into()
    }
  } else {
    raw.trim_end_matches('/').into()
  }
}

fn openai_chat(provider: &Value, messages: Vec<Value>) -> Result<String, String> {
  let client = reqwest::blocking::Client::new();
  let url = format!("{}/chat/completions", base_url(provider));
  let mut req = client.post(url).json(&json!({
    "model": provider_field(provider, "model"),
    "messages": messages,
    "temperature": 0.7
  }));
  let api_key = provider_field(provider, "apiKey");
  if !api_key.is_empty() {
    req = req.bearer_auth(api_key);
  }
  let res: Value = req.send().map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json().map_err(|e| e.to_string())?;
  Ok(res.pointer("/choices/0/message/content").and_then(Value::as_str).unwrap_or("").to_string())
}

fn claude_chat(provider: &Value, messages: Vec<Value>) -> Result<String, String> {
  let client = reqwest::blocking::Client::new();
  let system = messages.iter().find(|m| m.get("role").and_then(Value::as_str) == Some("system")).and_then(|m| m.get("content")).and_then(Value::as_str).unwrap_or("").to_string();
  let anthropic_messages: Vec<Value> = messages.into_iter().filter(|m| m.get("role").and_then(Value::as_str) != Some("system")).collect();
  let res: Value = client
    .post(format!("{}/v1/messages", base_url(provider)))
    .header("x-api-key", provider_field(provider, "apiKey"))
    .header("anthropic-version", "2023-06-01")
    .json(&json!({
      "model": provider_field(provider, "model"),
      "max_tokens": 4096,
      "system": system,
      "messages": anthropic_messages
    }))
    .send()
    .map_err(|e| e.to_string())?
    .error_for_status()
    .map_err(|e| e.to_string())?
    .json()
    .map_err(|e| e.to_string())?;
  Ok(res.get("content").and_then(Value::as_array).and_then(|items| items.first()).and_then(|item| item.get("text")).and_then(Value::as_str).unwrap_or("").to_string())
}

fn run_chat(messages: Vec<Value>) -> Result<String, String> {
  let provider = active_provider().ok_or_else(|| "未配置 AI Provider".to_string())?;
  let provider_type = provider.get("type").and_then(Value::as_str).unwrap_or("openai");
  if provider_type == "claude" {
    claude_chat(&provider, messages)
  } else {
    openai_chat(&provider, normalize_messages(&messages))
  }
}

fn emit_text(app: &AppHandle, content: &str) {
  let _ = app.emit("ai:stream", json!({ "type": "text", "content": content }));
  let _ = app.emit("ai:stream", json!({ "type": "done", "content": "" }));
}

fn emit_error(app: &AppHandle, error: &str) {
  let _ = app.emit("ai:stream", json!({ "type": "error", "content": error }));
  let _ = app.emit("ai:stream", json!({ "type": "done", "content": "" }));
}

pub fn handle(app: &AppHandle, channel: &str, params: Value) -> Result<Option<Value>, String> {
  match channel {
    "ai:chat" | "ai:chat-agent" => {
      let messages = params.get("messages").and_then(Value::as_array).cloned().unwrap_or_default();
      match run_chat(messages) {
        Ok(content) => emit_text(app, &content),
        Err(err) => emit_error(app, &err)
      }
      Ok(Some(Value::Null))
    }
    "ai:complete" => {
      let text = params.get("text").and_then(Value::as_str).unwrap_or("");
      let system = params.get("system").and_then(Value::as_str).unwrap_or("");
      let mut messages = Vec::new();
      if !system.is_empty() {
        messages.push(json!({ "role": "system", "content": system }));
      }
      messages.push(json!({ "role": "user", "content": text }));
      Ok(Some(Value::String(run_chat(messages)?)))
    }
    "ai:summarize" => {
      let content = params.get("content").and_then(Value::as_str).unwrap_or("");
      let messages = vec![json!({ "role": "user", "content": format!("请总结以下内容：\n\n{content}") })];
      Ok(Some(Value::String(run_chat(messages)?)))
    }
    "ai:detect-intent" => Ok(Some(json!({}))),
    "ai:stop" | "ai:complete-abort" => Ok(Some(Value::Null)),
    "ai:suggest-tags" => Ok(Some(json!([]))),
    "ai:infer-links" | "ai:infer-global-links" => Ok(Some(json!({ "success": false, "error": "Tauri AI link inference is not migrated yet" }))),
    "ai:generate-memories" => Ok(Some(json!({ "success": false, "generated": 0, "skipped": 0, "failed": 0, "total": 0, "error": "Tauri AI memory generation is not migrated yet" }))),
    "ai:edit" => Ok(Some(json!({ "success": false, "error": "Tauri AI edit is not migrated yet" }))),
    "ai:generate-graph" => Ok(Some(json!({ "success": false, "error": "Tauri AI graph generation is not migrated yet" }))),
    "ai:generate-notes" => Ok(Some(json!({ "success": false, "files": [], "error": "Tauri AI note generation is not migrated yet" }))),
    "kanban:ai-analyze" => Ok(Some(json!({ "summary": "Tauri kanban AI analysis is not migrated yet" }))),
    "kanban:ai-breakdown-task" | "kanban:ai-from-note" => Ok(Some(json!({ "tasks": [], "relations": [], "summary": "Tauri kanban AI is not migrated yet" }))),
    _ => Ok(None)
  }
}

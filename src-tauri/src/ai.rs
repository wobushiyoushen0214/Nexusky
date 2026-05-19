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
        .or_else(|| {
            providers
                .iter()
                .find(|p| p.get("enabled").and_then(Value::as_bool).unwrap_or(true))
        })
        .cloned()
}

fn message_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    content
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
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
    provider
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn base_url(provider: &Value) -> String {
    let raw = provider_field(provider, "baseUrl");
    if raw.trim().is_empty() {
        match provider
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("openai")
        {
            "claude" => "https://api.anthropic.com".into(),
            "ollama" => "http://127.0.0.1:11434/v1".into(),
            _ => "https://api.openai.com/v1".into(),
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
    let res: Value = req
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    Ok(res
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string())
}

fn claude_chat(provider: &Value, messages: Vec<Value>) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let system = messages
        .iter()
        .find(|m| m.get("role").and_then(Value::as_str) == Some("system"))
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let anthropic_messages: Vec<Value> = messages
        .into_iter()
        .filter(|m| m.get("role").and_then(Value::as_str) != Some("system"))
        .collect();
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
    Ok(res
        .get("content")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string())
}

fn run_chat(messages: Vec<Value>) -> Result<String, String> {
    let provider = active_provider().ok_or_else(|| "未配置 AI Provider".to_string())?;
    let provider_type = provider
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("openai");
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

fn parse_tags(value: &str) -> Vec<Value> {
    value
        .split(|c| [',', '，', '、', '\n'].contains(&c))
        .map(str::trim)
        .filter(|tag| !tag.is_empty() && tag.chars().count() < 20)
        .map(|tag| Value::String(tag.trim_start_matches('#').to_string()))
        .collect()
}

fn normalize_intent(value: &str, allowed: &[String]) -> String {
    let normalized = value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphabetic() || *c == '_' || *c == '-')
        .collect::<String>();
    if allowed.iter().any(|intent| intent == &normalized) {
        normalized
    } else {
        "chat".into()
    }
}

pub fn handle(app: &AppHandle, channel: &str, params: Value) -> Result<Option<Value>, String> {
    match channel {
        "ai:chat" | "ai:chat-agent" => {
            let messages = params
                .get("messages")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            match run_chat(messages) {
                Ok(content) => emit_text(app, &content),
                Err(err) => emit_error(app, &err),
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
            let messages = vec![
                json!({ "role": "user", "content": format!("请总结以下内容：\n\n{content}") }),
            ];
            Ok(Some(Value::String(run_chat(messages)?)))
        }
        "ai:detect-intent" => {
            let intents = params
                .get("intents")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .filter(|items| !items.is_empty())
                .unwrap_or_else(|| vec!["chat".into()]);
            let descriptions = json!({
              "graph": "user wants to generate a knowledge graph or visualize note relationships",
              "kanban": "user wants to extract tasks, create a kanban board, or manage todos from notes",
              "batch": "user wants to generate multiple separate note files",
              "edit": "user wants to modify or create a single note file",
              "chat": "normal conversation, Q&A, explanation, or anything else"
            });
            let tag_list = intents
                .iter()
                .map(|intent| {
                    format!(
                        "- {intent}: {}",
                        descriptions
                            .get(intent)
                            .and_then(Value::as_str)
                            .unwrap_or(intent)
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            let context = params
                .get("intentContext")
                .and_then(Value::as_str)
                .unwrap_or("");
            let system = format!(
                "Classify the user's latest intent.\n\nAvailable intents:\n{tag_list}\n\n{context}\n\nOutput exactly one intent name from the list. No punctuation, no explanation."
            );
            let mut messages = vec![json!({ "role": "system", "content": system })];
            let recent = params
                .get("messages")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let start = recent.len().saturating_sub(8);
            messages.extend(
                recent[start..]
                    .iter()
                    .filter(|message| message.get("role").and_then(Value::as_str) != Some("system"))
                    .cloned(),
            );
            let intent = run_chat(messages)
                .map(|response| normalize_intent(&response, &intents))
                .unwrap_or_else(|_| "chat".into());
            Ok(Some(json!({ "intent": intent })))
        }
        "ai:stop" | "ai:complete-abort" => Ok(Some(Value::Null)),
        "ai:suggest-tags" => {
            let content = params.get("content").and_then(Value::as_str).unwrap_or("");
            let existing = params
                .get("existingTags")
                .and_then(Value::as_array)
                .map(|tags| {
                    tags.iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            let result = run_chat(vec![
                json!({ "role": "system", "content": format!("你是一个标签建议助手。根据笔记内容建议 2-4 个标签。只输出标签，用逗号分隔，不要 # 前缀，不要解释。已有标签: {existing}") }),
                json!({ "role": "user", "content": content.chars().take(2000).collect::<String>() }),
            ]);
            Ok(Some(Value::Array(
                result.map(|text| parse_tags(&text)).unwrap_or_default(),
            )))
        }
        "ai:infer-links" | "ai:infer-global-links" => Ok(Some(
            json!({ "success": false, "error": "Tauri AI link inference is not migrated yet" }),
        )),
        "ai:generate-memories" => Ok(Some(
            json!({ "success": false, "generated": 0, "skipped": 0, "failed": 0, "total": 0, "error": "Tauri AI memory generation is not migrated yet" }),
        )),
        "ai:edit" => {
            let instruction = params
                .get("instruction")
                .and_then(Value::as_str)
                .unwrap_or("");
            let file_content = params
                .get("fileContent")
                .and_then(Value::as_str)
                .unwrap_or("");
            if file_content.len().div_ceil(4) > 12000 {
                return Ok(Some(json!({
                  "success": false,
                  "error": "当前笔记过大，无法安全生成完整文件修改。请先选中需要修改的段落，或把笔记拆成更小的文件后再使用 AI 编辑。"
                })));
            }

            let system = r#"You are a Markdown note editor. You receive the original note content and a modification instruction, then output the modified complete file.

<output_format>
Output the modified complete Markdown text directly. The first character of your response must be the first character of the file content.
- Preserve YAML frontmatter if present
- Preserve heading levels, list marker style (- or *), and blank line conventions from the original
- Output the ENTIRE file, not just the modified section
</output_format>

<constraints>
- Only modify what the instruction asks for; leave everything else unchanged
- Match the original list marker style: if the original uses -, keep -; if it uses *, keep *
- NEVER wrap output in ```markdown or any code fence
- NEVER prepend or append explanations, confirmations, or extra blank lines
</constraints>"#;
            let history = params
                .get("history")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .enumerate()
                        .map(|(index, item)| format!("{}. {item}", index + 1))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .filter(|text| !text.is_empty())
                .map(|text| format!("之前的修改指令（已应用）:\n{text}\n\n"))
                .unwrap_or_default();
            let file_path = params.get("filePath").and_then(Value::as_str).unwrap_or("");
            let user_content = format!(
                "文件: {file_path}\n\n当前内容:\n{file_content}\n\n{history}本次修改指令: {instruction}"
            );

            match run_chat(vec![
                json!({ "role": "system", "content": system }),
                json!({ "role": "user", "content": user_content }),
            ]) {
                Ok(content) => {
                    let trimmed = content.trim().to_string();
                    if trimmed.is_empty() {
                        Ok(Some(
                            json!({ "success": false, "error": "AI 未返回有效内容，请检查 API Key 配置" }),
                        ))
                    } else {
                        let _ = app.emit(
                            "ai:edit-stream",
                            json!({ "type": "text", "content": trimmed }),
                        );
                        let _ = app.emit("ai:edit-stream", json!({ "type": "done" }));
                        Ok(Some(json!({ "success": true, "content": trimmed })))
                    }
                }
                Err(error) => {
                    let _ = app.emit("ai:edit-stream", json!({ "type": "done" }));
                    Ok(Some(json!({ "success": false, "error": error })))
                }
            }
        }
        "ai:generate-graph" => Ok(Some(
            json!({ "success": false, "error": "Tauri AI graph generation is not migrated yet" }),
        )),
        "ai:generate-notes" => Ok(Some(
            json!({ "success": false, "files": [], "error": "Tauri AI note generation is not migrated yet" }),
        )),
        "kanban:ai-analyze" => Ok(Some(
            json!({ "summary": "Tauri kanban AI analysis is not migrated yet" }),
        )),
        "kanban:ai-breakdown-task" | "kanban:ai-from-note" => Ok(Some(
            json!({ "tasks": [], "relations": [], "summary": "Tauri kanban AI is not migrated yet" }),
        )),
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tag_responses() {
        assert_eq!(
            parse_tags("rust, Tauri，#笔记\nvery-very-very-very-long-tag-name"),
            vec![
                Value::String("rust".into()),
                Value::String("Tauri".into()),
                Value::String("笔记".into())
            ]
        );
    }

    #[test]
    fn normalizes_intent_responses() {
        let allowed = vec!["chat".into(), "edit".into()];
        assert_eq!(normalize_intent("Edit.", &allowed), "edit");
        assert_eq!(normalize_intent("delete", &allowed), "chat");
    }
}

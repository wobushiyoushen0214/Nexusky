use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
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

fn extract_json_value(text: &str) -> Option<Value> {
    let trimmed = text.trim();
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Some(value);
    }
    let without_fence = trimmed
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    if let Ok(value) = serde_json::from_str::<Value>(without_fence) {
        return Some(value);
    }
    let start = without_fence.find(['[', '{'])?;
    let end = without_fence.rfind([']', '}'])?;
    serde_json::from_str::<Value>(&without_fence[start..=end]).ok()
}

fn safe_note_title(title: &str) -> String {
    title
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect::<String>()
        .trim()
        .to_string()
}

fn note_name(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Note")
        .to_string()
}

fn read_note_summaries(file_paths: &[Value], limit: usize, chars: usize) -> (String, Vec<String>) {
    let mut content = String::new();
    let mut names = Vec::new();
    for path_value in file_paths.iter().take(limit) {
        let Some(path) = path_value.as_str() else {
            continue;
        };
        let Ok(raw) = fs::read_to_string(path) else {
            continue;
        };
        let name = note_name(path);
        names.push(name.clone());
        content.push_str(&format!(
            "## {name}\n{}\n\n---\n\n",
            raw.chars().take(chars).collect::<String>()
        ));
    }
    (content, names)
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
        "ai:generate-graph" => {
            let file_paths = params
                .get("filePaths")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let (files_content, file_names) = read_note_summaries(&file_paths, 30, 1000);
            if files_content.is_empty() {
                return Ok(Some(
                    json!({ "success": false, "error": "无法读取文件内容" }),
                ));
            }
            let system = r#"Analyze knowledge relationships between notes and output a Mermaid graph. Output graph TD syntax directly — the first line must be "graph TD".

<format>
- Node IDs use letters (A, B, C...), labels use square brackets wrapping the note title
- Edges use -->|relationship| annotation, relationship labels are 2-4 words
- Each node has at most 3 edges — keep only the most meaningful relationships
</format>

<quality>
- Only create edges between genuinely related content — do not force connections for graph connectivity
- Relationship labels must be specific
- When note count is large (>10), prioritize cross-topic bridging relationships
</quality>"#;
            match run_chat(vec![
                json!({ "role": "system", "content": system }),
                json!({ "role": "user", "content": format!("Below are {} notes. Analyze their relationships and generate a knowledge graph:\n\n{files_content}", file_names.len()) }),
            ]) {
                Ok(content) => {
                    let trimmed = content.trim().to_string();
                    let _ = app.emit("ai:graph-progress", json!({ "content": trimmed }));
                    let _ = app.emit("ai:graph-done", json!({}));
                    Ok(Some(json!({ "success": true, "content": trimmed })))
                }
                Err(error) => Ok(Some(json!({ "success": false, "error": error }))),
            }
        }
        "ai:generate-notes" => {
            let vault_path = params
                .get("vaultPath")
                .and_then(Value::as_str)
                .unwrap_or("");
            let target_dir = params
                .get("targetDir")
                .and_then(Value::as_str)
                .unwrap_or(vault_path);
            let instruction = params
                .get("instruction")
                .and_then(Value::as_str)
                .unwrap_or("");
            let _ = app.emit(
                "ai:generate-notes-progress",
                json!({ "stage": "planning", "message": "正在规划笔记结构..." }),
            );
            let plan_text = match run_chat(vec![
                json!({ "role": "system", "content": "你是一个笔记规划助手。用户会给你一个主题，请规划需要创建的笔记列表。输出格式为 JSON 数组，每项包含 title（文件标题）和 brief（一句话描述内容方向）。title 是纯笔记标题，绝对不要包含目录名、路径前缀或分类前缀。只输出 JSON，不要其他文字。" }),
                json!({ "role": "user", "content": instruction }),
            ]) {
                Ok(text) => text,
                Err(error) => {
                    return Ok(Some(
                        json!({ "success": false, "error": error, "files": [] }),
                    ))
                }
            };
            let Some(parsed_plan) = extract_json_value(&plan_text) else {
                return Ok(Some(
                    json!({ "success": false, "error": "规划解析失败，请重试", "files": [] }),
                ));
            };
            let plan_items = parsed_plan
                .as_array()
                .cloned()
                .or_else(|| parsed_plan.get("notes").and_then(Value::as_array).cloned())
                .unwrap_or_default();
            if plan_items.is_empty() {
                return Ok(Some(
                    json!({ "success": false, "error": "规划解析失败，请重试", "files": [] }),
                ));
            }

            fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;
            let dir_name = if target_dir == vault_path {
                "根目录".to_string()
            } else {
                Path::new(target_dir)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("")
                    .to_string()
            };
            let _ = app.emit(
                "ai:generate-notes-progress",
                json!({ "stage": "planned", "message": format!("将在「{dir_name}」下生成 {} 篇笔记", plan_items.len()), "plan": plan_items }),
            );

            let titles = plan_items
                .iter()
                .filter_map(|item| item.get("title").and_then(Value::as_str))
                .map(safe_note_title)
                .filter(|title| !title.is_empty())
                .collect::<Vec<_>>();
            let mut created_files = Vec::new();
            for (index, item) in plan_items.iter().enumerate() {
                let title = titles
                    .get(index)
                    .cloned()
                    .unwrap_or_else(|| format!("Note {}", index + 1));
                let brief = item.get("brief").and_then(Value::as_str).unwrap_or("");
                let _ = app.emit(
                    "ai:generate-notes-progress",
                    json!({ "stage": "generating", "message": format!("正在生成 ({}/{}): {title}", index + 1, plan_items.len()), "current": index + 1, "total": plan_items.len() }),
                );
                let other_titles = titles
                    .iter()
                    .filter(|other| *other != &title)
                    .map(|other| format!("- {other}"))
                    .collect::<Vec<_>>()
                    .join("\n");
                let note_content = match run_chat(vec![
                    json!({ "role": "system", "content": "你是一个知识库笔记写作助手。请根据标题和描述，写一篇结构清晰的 Markdown 笔记。第一行必须是 # 标题，标题必须和给定标题完全一致。不要使用 [[]] 双链语法。只输出 Markdown 内容，不要其他解释。" }),
                    json!({ "role": "user", "content": format!("标题: {title}\n描述: {brief}\n\n同批次的其他笔记主题（可在内容中自然提及相关概念）:\n{other_titles}") }),
                ]) {
                    Ok(content) => content.trim().to_string(),
                    Err(_) => continue,
                };
                if note_content.is_empty() {
                    continue;
                }
                let file_path = PathBuf::from(target_dir).join(format!("{title}.md"));
                if fs::write(&file_path, note_content).is_ok() {
                    let file_path_str = file_path.to_string_lossy().to_string();
                    let _ = crate::db::handle(
                        "db:index-file",
                        json!({ "vaultPath": vault_path, "filePath": file_path_str }),
                    );
                    created_files.push(Value::String(file_path_str));
                }
            }

            let _ = app.emit("vault:files-changed", json!({}));
            let _ = app.emit(
                "ai:generate-notes-progress",
                json!({ "stage": "done", "message": format!("完成！已生成 {} 个文件", created_files.len()) }),
            );
            Ok(Some(json!({ "success": true, "files": created_files })))
        }
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

    #[test]
    fn extracts_json_from_fenced_ai_output() {
        let value = extract_json_value("```json\n[{\"title\":\"A\",\"brief\":\"B\"}]\n```")
            .expect("json should parse");
        assert_eq!(value[0]["title"], Value::String("A".into()));
    }

    #[test]
    fn cleans_note_titles_for_file_names() {
        assert_eq!(safe_note_title("a/b:c*?"), "abc");
    }
}

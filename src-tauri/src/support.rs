use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Command;
use walkdir::WalkDir;

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

fn is_usable_openai_key(key: &str) -> bool {
    regex::Regex::new(r"^sk-[A-Za-z0-9_-]+")
        .map(|regex| regex.is_match(key.trim()))
        .unwrap_or(false)
}

fn read_json_file(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
}

fn detect_local_ai_config() -> Value {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from(""));
    let mut result = json!({ "skipped": [] });

    let claude_paths = {
        #[cfg(target_os = "windows")]
        {
            let mut paths = vec![home.join(".claude").join("settings.json")];
            if let Ok(appdata) = env::var("APPDATA") {
                paths.push(PathBuf::from(appdata).join("claude").join("settings.json"));
            }
            paths
        }
        #[cfg(target_os = "linux")]
        {
            vec![
                home.join(".claude").join("settings.json"),
                home.join(".config").join("claude").join("settings.json"),
            ]
        }
        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            vec![home.join(".claude").join("settings.json")]
        }
    };

    for path in claude_paths {
        let Some(data) = read_json_file(&path) else {
            continue;
        };
        let env = data.get("env").unwrap_or(&Value::Null);
        if let Some(token) = env.get("ANTHROPIC_AUTH_TOKEN").and_then(Value::as_str) {
            result["claude"] = json!({
                "apiKey": token,
                "baseUrl": env.get("ANTHROPIC_BASE_URL").and_then(Value::as_str).unwrap_or(""),
                "source": "Claude Code"
            });
            break;
        }
    }

    if let Ok(api_key) = env::var("OPENAI_API_KEY") {
        if is_usable_openai_key(&api_key) {
            result["openai"] =
                json!({ "apiKey": api_key.trim(), "source": "环境变量 OPENAI_API_KEY" });
        }
    }

    let codex_paths = {
        #[cfg(target_os = "windows")]
        {
            let mut paths = vec![home.join(".codex").join("auth.json")];
            if let Ok(appdata) = env::var("APPDATA") {
                paths.push(PathBuf::from(appdata).join("codex").join("auth.json"));
            }
            paths
        }
        #[cfg(target_os = "linux")]
        {
            vec![
                home.join(".codex").join("auth.json"),
                home.join(".config").join("codex").join("auth.json"),
            ]
        }
        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            vec![home.join(".codex").join("auth.json")]
        }
    };

    for path in codex_paths {
        let Some(data) = read_json_file(&path) else {
            continue;
        };
        if result.get("openai").is_none() {
            if let Some(api_key) = data.get("OPENAI_API_KEY").and_then(Value::as_str) {
                if is_usable_openai_key(api_key) {
                    result["openai"] =
                        json!({ "apiKey": api_key.trim(), "source": "Codex API Key" });
                    break;
                }
            }
        }
        if data.get("auth_mode").and_then(Value::as_str) == Some("chatgpt")
            && data.get("tokens").is_some()
        {
            result["codex"] = json!({ "command": "codex", "source": "Codex ChatGPT 登录" });
        } else if data.get("OPENAI_API_KEY").and_then(Value::as_str).is_some()
            && result.get("openai").is_none()
        {
            result["skipped"]
                .as_array_mut()
                .expect("skipped should be array")
                .push(Value::String(
                    "Codex 中的 OpenAI Key 格式不符合 API Key 要求，已跳过".into(),
                ));
        }
    }

    if result.get("claude").is_none() {
        if let Ok(api_key) = env::var("ANTHROPIC_API_KEY") {
            result["claude"] = json!({
                "apiKey": api_key,
                "baseUrl": env::var("ANTHROPIC_BASE_URL").unwrap_or_default(),
                "source": "环境变量 ANTHROPIC_API_KEY"
            });
        }
    }

    if result
        .get("skipped")
        .and_then(Value::as_array)
        .map(Vec::is_empty)
        .unwrap_or(true)
    {
        result
            .as_object_mut()
            .expect("result should be object")
            .remove("skipped");
    }
    result
}

fn list_ollama_models(base_url: Option<&str>) -> Value {
    let raw = base_url
        .filter(|url| !url.trim().is_empty())
        .unwrap_or("http://localhost:11434")
        .trim()
        .trim_end_matches('/');
    let url = raw.strip_suffix("/v1").unwrap_or(raw);
    let Ok(response) = reqwest::blocking::get(format!("{url}/api/tags")) else {
        return json!([]);
    };
    if !response.status().is_success() {
        return json!([]);
    }
    let Ok(data) = response.json::<Value>() else {
        return json!([]);
    };
    Value::Array(
        data.get("models")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|model| model.get("name").and_then(Value::as_str))
            .filter(|name| !name.is_empty())
            .map(|name| Value::String(name.to_string()))
            .collect(),
    )
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

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn inline_markdown_to_html(value: &str) -> String {
    let mut html = escape_html(value);
    let replacements = [
        (r"!\[([^\]]*)\]\(([^)]+)\)", r#"<img src="$2" alt="$1">"#),
        (r"\[([^\]]+)\]\(([^)]+)\)", r#"<a href="$2">$1</a>"#),
        (r"\[\[([^\]]+)\]\]", r##"<a href="#">$1</a>"##),
        (r"`(.+?)`", r#"<code>$1</code>"#),
        (r"\*\*(.+?)\*\*", r#"<strong>$1</strong>"#),
        (r"\*(.+?)\*", r#"<em>$1</em>"#),
    ];
    for (pattern, replacement) in replacements {
        if let Ok(regex) = regex::Regex::new(pattern) {
            html = regex.replace_all(&html, replacement).to_string();
        }
    }
    html
}

fn markdown_to_html(markdown: &str) -> String {
    let mut html = String::new();
    let mut in_list = false;

    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if in_list {
                html.push_str("</ul>\n");
                in_list = false;
            }
            continue;
        }

        if let Some(item) = trimmed.strip_prefix("- ") {
            if !in_list {
                html.push_str("<ul>");
                in_list = true;
            }
            html.push_str(&format!("<li>{}</li>\n", inline_markdown_to_html(item)));
            continue;
        }

        if in_list {
            html.push_str("</ul>\n");
            in_list = false;
        }

        let line_html = if let Some(text) = trimmed.strip_prefix("### ") {
            format!("<h3>{}</h3>", inline_markdown_to_html(text))
        } else if let Some(text) = trimmed.strip_prefix("## ") {
            format!("<h2>{}</h2>", inline_markdown_to_html(text))
        } else if let Some(text) = trimmed.strip_prefix("# ") {
            format!("<h1>{}</h1>", inline_markdown_to_html(text))
        } else if let Some(text) = trimmed.strip_prefix("> ") {
            format!("<blockquote>{}</blockquote>", inline_markdown_to_html(text))
        } else if trimmed == "---" {
            "<hr>".to_string()
        } else {
            format!("<p>{}</p>", inline_markdown_to_html(trimmed))
        };
        html.push_str(&line_html);
        html.push('\n');
    }

    if in_list {
        html.push_str("</ul>\n");
    }
    html
}

fn export_html_document(title: &str, content: &str, share: bool) -> String {
    let background = if share { "#fafafa" } else { "#fff" };
    let footer = if share {
        r#"<div class="footer">由 Nexusky 生成</div>"#
    } else {
        ""
    };
    format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 40px 20px; line-height: 1.7; color: #1a1a1a; background: {}; }}
    h1 {{ font-size: 2rem; margin: 2rem 0 1rem; }}
    h2 {{ font-size: 1.5rem; margin: 1.5rem 0 0.75rem; }}
    h3 {{ font-size: 1.2rem; margin: 1.25rem 0 0.5rem; }}
    code {{ background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }}
    pre {{ background: #f4f4f5; padding: 16px; border-radius: 8px; overflow-x: auto; }}
    pre code {{ background: none; padding: 0; }}
    blockquote {{ border-left: 3px solid #6366f1; padding-left: 1rem; color: #666; margin: 1rem 0; }}
    a {{ color: #6366f1; }}
    img {{ max-width: 100%; border-radius: 8px; }}
    table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
    th, td {{ border: 1px solid #e5e5e5; padding: 8px 12px; text-align: left; }}
    th {{ background: #f9f9f9; }}
    hr {{ border: none; height: 1px; background: #e0e0e0; margin: 2rem 0; }}
    .footer {{ margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e0e0e0; font-size: 0.8rem; color: #999; text-align: center; }}
  </style>
</head>
<body>
{}
{}
</body>
</html>"#,
        escape_html(title),
        background,
        markdown_to_html(content),
        footer
    )
}

fn save_dialog(default_name: &str, extension: &str, label: &str) -> Option<std::path::PathBuf> {
    rfd::FileDialog::new()
        .set_title(label)
        .set_file_name(default_name)
        .add_filter(label, &[extension])
        .save_file()
}

fn write_clipboard(text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut child = Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let mut child = Command::new("clip")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut child = Command::new("sh")
        .arg("-c")
        .arg("wl-copy || xclip -selection clipboard")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("写入剪贴板失败".into())
    }
}

fn pdf_escape(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            '(' | ')' | '\\' => format!("\\{c}"),
            '\r' | '\n' => " ".to_string(),
            c if c.is_ascii() => c.to_string(),
            _ => "?".to_string(),
        })
        .collect()
}

fn simple_pdf(title: &str, content: &str) -> Vec<u8> {
    let mut stream = String::from("BT /F1 18 Tf 50 790 Td ");
    stream.push_str(&format!("({}) Tj ", pdf_escape(title)));
    stream.push_str("/F1 11 Tf 0 -28 Td ");
    for line in content.lines().take(45) {
        stream.push_str(&format!("({}) Tj 0 -16 Td ", pdf_escape(line)));
    }
    stream.push_str("ET");

    let objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n".to_string(),
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n".to_string(),
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n".to_string(),
        "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n".to_string(),
        format!("5 0 obj << /Length {} >> stream\n{}\nendstream endobj\n", stream.len(), stream),
    ];

    let mut pdf = String::from("%PDF-1.4\n");
    let mut offsets = Vec::new();
    for object in objects {
        offsets.push(pdf.len());
        pdf.push_str(&object);
    }
    let xref_offset = pdf.len();
    pdf.push_str("xref\n0 6\n0000000000 65535 f \n");
    for offset in offsets {
        pdf.push_str(&format!("{offset:010} 00000 n \n"));
    }
    pdf.push_str(&format!(
        "trailer << /Size 6 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
    ));
    pdf.into_bytes()
}

fn export_pdf(title: &str, content: &str, path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let html = export_html_document(title, content, false);
        let temp_path = std::env::temp_dir().join(format!(
            "nexusky-export-{}.html",
            chrono::Utc::now().timestamp_millis()
        ));
        fs::write(&temp_path, html).map_err(|e| e.to_string())?;
        let status = Command::new("textutil")
            .arg("-convert")
            .arg("pdf")
            .arg("-output")
            .arg(path)
            .arg(&temp_path)
            .status();
        let _ = fs::remove_file(&temp_path);
        if matches!(status, Ok(s) if s.success()) {
            return Ok(());
        }
    }

    fs::write(path, simple_pdf(title, content)).map_err(|e| e.to_string())
}

fn active_sync_provider() -> String {
    get_config("syncProvider", Value::String("supabase".into()))
        .as_str()
        .unwrap_or("supabase")
        .to_string()
}

fn configured_icloud_path() -> Option<PathBuf> {
    if let Some(custom) = get_config("icloudPath", Value::Null).as_str() {
        let path = PathBuf::from(custom);
        if path.exists() {
            return Some(path);
        }
    }
    let home = dirs::home_dir()?;
    [
        home.join("Library")
            .join("Mobile Documents")
            .join("iCloud~com~nexusky~notes")
            .join("Documents"),
        home.join("Library")
            .join("Mobile Documents")
            .join("com~apple~CloudDocs")
            .join("Nexusky"),
    ]
    .into_iter()
    .find(|path| path.exists())
}

fn collect_sync_files(base: &Path) -> Vec<PathBuf> {
    WalkDir::new(base)
        .into_iter()
        .filter_entry(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().is_file()
                && entry.path().extension().and_then(|ext| ext.to_str()) == Some("md")
        })
        .map(|entry| entry.path().to_path_buf())
        .collect()
}

fn rel_sync_path(base: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(base)
        .map_err(|e| e.to_string())
        .map(|rel| {
            rel.to_string_lossy()
                .replace('\\', "/")
                .trim_start_matches('/')
                .to_string()
        })
}

fn file_hash(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", md5::compute(bytes)))
}

fn icloud_push_file(vault_path: &Path, file_path: &Path) -> Result<bool, String> {
    let Some(base) = configured_icloud_path() else {
        return Ok(false);
    };
    let rel = rel_sync_path(vault_path, file_path)?;
    let dest = base.join(rel);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(file_path, dest).map_err(|e| e.to_string())?;
    Ok(true)
}

fn icloud_pull_file(vault_path: &Path, rel_path: &str) -> Result<bool, String> {
    let Some(base) = configured_icloud_path() else {
        return Ok(false);
    };
    let source = base.join(rel_path);
    if !source.exists() {
        return Ok(false);
    }
    let dest = vault_path.join(rel_path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(source, dest).map_err(|e| e.to_string())?;
    Ok(true)
}

fn icloud_sync(vault_path: &Path, pull_only: bool) -> Result<Value, String> {
    let Some(base) = configured_icloud_path() else {
        return Ok(
            json!({ "total": 0, "pushed": 0, "pulled": 0, "conflicts": [], "errors": ["iCloud Drive 不可用"] }),
        );
    };
    let mut pushed = 0;
    let mut pulled = 0;
    let mut errors = Vec::<String>::new();
    let local_files = collect_sync_files(vault_path);
    let remote_files = collect_sync_files(&base);
    let mut remote_map = std::collections::HashMap::new();
    for remote in remote_files {
        let rel = rel_sync_path(&base, &remote)?;
        remote_map.insert(rel, remote);
    }

    for local in &local_files {
        let rel = rel_sync_path(vault_path, local)?;
        if let Some(remote) = remote_map.remove(&rel) {
            let local_hash = file_hash(local)?;
            let remote_hash = file_hash(&remote)?;
            if local_hash != remote_hash {
                let local_mtime = fs::metadata(local).and_then(|m| m.modified()).ok();
                let remote_mtime = fs::metadata(&remote).and_then(|m| m.modified()).ok();
                if remote_mtime > local_mtime {
                    if icloud_pull_file(vault_path, &rel)? {
                        pulled += 1;
                    } else {
                        errors.push(format!("pull failed: {rel}"));
                    }
                } else if !pull_only {
                    if icloud_push_file(vault_path, local)? {
                        pushed += 1;
                    } else {
                        errors.push(format!("push failed: {rel}"));
                    }
                }
            }
        } else if !pull_only {
            if icloud_push_file(vault_path, local)? {
                pushed += 1;
            } else {
                errors.push(format!("push failed: {rel}"));
            }
        }
    }

    for (rel, remote) in remote_map {
        let local = vault_path.join(&rel);
        if !local.exists() && icloud_pull_file(vault_path, &rel)? {
            pulled += 1;
        } else if !local.exists() {
            errors.push(format!("pull failed: {}", remote.to_string_lossy()));
        }
    }

    Ok(
        json!({ "total": local_files.len() + pulled, "pushed": pushed, "pulled": pulled, "conflicts": [], "errors": errors }),
    )
}

fn supabase_config() -> Option<(String, String)> {
    let config = get_config("cloudConfig", json!({}));
    let url = config
        .get("supabaseUrl")?
        .as_str()?
        .trim()
        .trim_end_matches('/');
    let key = config
        .get("serviceRoleKey")
        .and_then(Value::as_str)
        .filter(|key| !key.trim().is_empty())
        .or_else(|| config.get("supabaseKey").and_then(Value::as_str))?
        .trim();
    if url.is_empty() || key.is_empty() {
        None
    } else {
        Some((url.to_string(), key.to_string()))
    }
}

fn supabase_test_connection() -> Value {
    let Some((url, key)) = supabase_config() else {
        return json!({ "ok": false, "error": "未配置 Supabase" });
    };
    let client = reqwest::blocking::Client::new();
    match client
        .get(format!("{url}/rest/v1/note_sync?select=id&limit=1"))
        .header("apikey", &key)
        .bearer_auth(&key)
        .send()
    {
        Ok(response) if response.status().is_success() => json!({ "ok": true }),
        Ok(response) => {
            json!({ "ok": false, "error": format!("Supabase 返回 HTTP {}", response.status()) })
        }
        Err(error) => json!({ "ok": false, "error": error.to_string() }),
    }
}

fn encode_segment(segment: &str) -> String {
    if segment
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
    {
        return segment.to_string();
    }
    let ext = Path::new(segment)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| format!(".{ext}"))
        .unwrap_or_default();
    format!("{:x}{ext}", md5::compute(segment))
}

fn supabase_storage_path(rel_path: &str) -> String {
    if rel_path
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '/'))
    {
        rel_path.to_string()
    } else {
        rel_path
            .split('/')
            .map(encode_segment)
            .collect::<Vec<_>>()
            .join("/")
    }
}

fn supabase_client() -> Option<(reqwest::blocking::Client, String, String)> {
    let (url, key) = supabase_config()?;
    Some((reqwest::blocking::Client::new(), url, key))
}

fn supabase_push_file(vault_path: &Path, file_path: &Path) -> Result<bool, String> {
    let Some((client, url, key)) = supabase_client() else {
        return Ok(false);
    };
    let rel = rel_sync_path(vault_path, file_path)?;
    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let hash = format!("{:x}", md5::compute(&content));
    let storage_path = supabase_storage_path(&rel);
    let upload = client
        .post(format!("{url}/storage/v1/object/notes/{storage_path}"))
        .header("apikey", &key)
        .bearer_auth(&key)
        .header("x-upsert", "true")
        .header(
            "content-type",
            if file_path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                "application/json; charset=utf-8"
            } else {
                "text/markdown; charset=utf-8"
            },
        )
        .body(content)
        .send()
        .map_err(|e| e.to_string())?;
    if !upload.status().is_success() {
        return Ok(false);
    }
    let upsert = client
        .post(format!("{url}/rest/v1/note_sync?on_conflict=file_path"))
        .header("apikey", &key)
        .bearer_auth(&key)
        .header("content-type", "application/json")
        .header("prefer", "resolution=merge-duplicates")
        .json(&json!({
          "file_path": rel,
          "content_hash": hash,
          "updated_at": chrono::Utc::now().to_rfc3339()
        }))
        .send()
        .map_err(|e| e.to_string())?;
    Ok(upsert.status().is_success())
}

fn supabase_pull_file(vault_path: &Path, rel_path: &str) -> Result<bool, String> {
    let Some((client, url, key)) = supabase_client() else {
        return Ok(false);
    };
    let storage_path = supabase_storage_path(rel_path);
    let response = client
        .get(format!("{url}/storage/v1/object/notes/{storage_path}"))
        .header("apikey", &key)
        .bearer_auth(&key)
        .send()
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Ok(false);
    }
    let content = response.text().map_err(|e| e.to_string())?;
    let dest = vault_path.join(rel_path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(dest, content).map_err(|e| e.to_string())?;
    Ok(true)
}

fn supabase_remote_files() -> Result<Vec<(String, String, String)>, String> {
    let Some((client, url, key)) = supabase_client() else {
        return Ok(Vec::new());
    };
    let response = client
        .get(format!(
            "{url}/rest/v1/note_sync?select=file_path,content_hash,updated_at"
        ))
        .header("apikey", &key)
        .bearer_auth(&key)
        .send()
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Ok(Vec::new());
    }
    let rows = response.json::<Value>().map_err(|e| e.to_string())?;
    Ok(rows
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|row| {
            Some((
                row.get("file_path")?.as_str()?.to_string(),
                row.get("content_hash")?.as_str()?.to_string(),
                row.get("updated_at")?.as_str()?.to_string(),
            ))
        })
        .collect())
}

fn supabase_sync(vault_path: &Path, pull_only: bool) -> Result<Value, String> {
    if supabase_config().is_none() {
        return Ok(
            json!({ "total": 0, "pushed": 0, "pulled": 0, "conflicts": [], "errors": ["未配置 Supabase"] }),
        );
    }
    let mut pushed = 0;
    let mut pulled = 0;
    let mut conflicts = Vec::<Value>::new();
    let mut errors = Vec::<String>::new();
    let mut remote_map = std::collections::HashMap::new();
    for (path, hash, updated_at) in supabase_remote_files()? {
        remote_map.insert(path, (hash, updated_at));
    }
    let local_files = collect_sync_files(vault_path);
    for local in &local_files {
        let rel = rel_sync_path(vault_path, local)?;
        let local_hash = file_hash(local)?;
        if let Some((remote_hash, remote_updated_at)) = remote_map.remove(&rel) {
            if remote_hash != local_hash {
                let local_mtime = fs::metadata(local)
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis() as i64)
                    .unwrap_or(0);
                let remote_mtime = chrono::DateTime::parse_from_rfc3339(&remote_updated_at)
                    .map(|dt| dt.timestamp_millis())
                    .unwrap_or(0);
                if remote_mtime > local_mtime {
                    conflicts.push(json!({ "path": rel, "localHash": local_hash, "remoteHash": remote_hash, "remoteUpdatedAt": remote_updated_at }));
                } else if !pull_only && supabase_push_file(vault_path, local)? {
                    pushed += 1;
                }
            }
        } else if !pull_only && supabase_push_file(vault_path, local)? {
            pushed += 1;
        }
    }
    for (rel, _) in remote_map {
        if !vault_path.join(&rel).exists() && supabase_pull_file(vault_path, &rel)? {
            pulled += 1;
        } else if !vault_path.join(&rel).exists() {
            errors.push(format!("pull failed: {rel}"));
        }
    }
    Ok(
        json!({ "total": local_files.len() + pulled, "pushed": pushed, "pulled": pulled, "conflicts": conflicts, "errors": errors }),
    )
}

fn active_cloud_test_connection(provider: &str) -> Value {
    match provider {
        "icloud" => configured_icloud_path()
            .map(|_| json!({ "ok": true }))
            .unwrap_or_else(|| json!({ "ok": false, "error": "未找到 iCloud Drive 路径。请确保已登录 iCloud 并启用 iCloud Drive。" })),
        "supabase" => supabase_test_connection(),
        "onedrive" => onedrive_request("/me/drive", "GET", None)
            .map(|_| json!({ "ok": true }))
            .unwrap_or_else(|error| json!({ "ok": false, "error": error })),
        _ => json!({ "ok": false, "error": "未知同步后端" }),
    }
}

fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                vec![byte as char]
            } else {
                format!("%{byte:02X}").chars().collect()
            }
        })
        .collect()
}

fn encode_graph_path(path: &str) -> String {
    path.split('/')
        .map(percent_encode)
        .collect::<Vec<_>>()
        .join("/")
}

fn onedrive_config() -> Option<Value> {
    let value = get_config("onedriveConfig", Value::Null);
    value
        .get("accessToken")
        .and_then(Value::as_str)
        .filter(|token| !token.is_empty())?;
    Some(value)
}

fn onedrive_request(path: &str, method: &str, body: Option<String>) -> Result<Value, String> {
    let config = onedrive_config().ok_or_else(|| "OneDrive 未配置".to_string())?;
    let token = config
        .get("accessToken")
        .and_then(Value::as_str)
        .ok_or_else(|| "OneDrive 未配置".to_string())?;
    let client = reqwest::blocking::Client::new();
    let mut request = client
        .request(
            reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?,
            format!("https://graph.microsoft.com/v1.0{path}"),
        )
        .bearer_auth(token);
    if let Some(body) = body {
        request = request
            .header("content-type", "text/plain; charset=utf-8")
            .body(body);
    }
    let response = request.send().map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Graph API HTTP {}", response.status()));
    }
    let text = response.text().map_err(|e| e.to_string())?;
    if text.trim_start().starts_with('{') || text.trim_start().starts_with('[') {
        serde_json::from_str(&text).map_err(|e| e.to_string())
    } else {
        Ok(Value::String(text))
    }
}

fn onedrive_folder() -> String {
    get_config("onedriveConfig", Value::Null)
        .get("folder")
        .and_then(Value::as_str)
        .filter(|folder| !folder.is_empty())
        .unwrap_or("/Nexusky")
        .to_string()
}

fn onedrive_push_file(vault_path: &Path, file_path: &Path) -> Result<bool, String> {
    let rel = rel_sync_path(vault_path, file_path)?;
    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let remote = format!("{}/{}", onedrive_folder().trim_end_matches('/'), rel);
    onedrive_request(
        &format!("/me/drive/root:{}:/content", encode_graph_path(&remote)),
        "PUT",
        Some(content),
    )
    .map(|_| true)
}

fn onedrive_pull_file(vault_path: &Path, rel_path: &str) -> Result<bool, String> {
    let remote = format!("{}/{}", onedrive_folder().trim_end_matches('/'), rel_path);
    let value = onedrive_request(
        &format!("/me/drive/root:{}:/content", encode_graph_path(&remote)),
        "GET",
        None,
    )?;
    let content = value.as_str().unwrap_or("").to_string();
    let dest = vault_path.join(rel_path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(dest, content).map_err(|e| e.to_string())?;
    Ok(true)
}

fn onedrive_auth(client_id: &str) -> Result<Value, String> {
    let redirect_uri = "http://localhost:23847/callback";
    let scope = "Files.ReadWrite.All offline_access";
    let listener = TcpListener::bind("127.0.0.1:23847").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let auth_url = format!(
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&response_mode=query",
        percent_encode(client_id),
        percent_encode(redirect_uri),
        percent_encode(scope)
    );
    open_external(&auth_url)?;
    let start = std::time::Instant::now();
    let mut code = String::new();
    while start.elapsed().as_secs() < 180 {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0_u8; 4096];
                let read = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..read]);
                if let Some(path) = request.split_whitespace().nth(1) {
                    if let Some(query) = path.split_once('?').map(|(_, q)| q) {
                        for pair in query.split('&') {
                            if let Some(value) = pair.strip_prefix("code=") {
                                code = value.replace("%2F", "/").replace("%2B", "+");
                                break;
                            }
                        }
                    }
                }
                let body = if code.is_empty() {
                    "Nexusky OneDrive auth failed"
                } else {
                    "Nexusky OneDrive auth complete. You can close this page."
                };
                let _ = stream.write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
                        body.len(), body
                    )
                    .as_bytes(),
                );
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    if code.is_empty() {
        return Ok(json!({ "success": false, "error": "授权超时或被取消" }));
    }
    let client = reqwest::blocking::Client::new();
    let response = client
        .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
        .header("content-type", "application/x-www-form-urlencoded")
        .body(format!(
            "client_id={}&code={}&redirect_uri={}&grant_type=authorization_code&scope={}",
            percent_encode(client_id),
            percent_encode(&code),
            percent_encode(redirect_uri),
            percent_encode(scope)
        ))
        .send()
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Ok(
            json!({ "success": false, "error": format!("Token 交换失败: HTTP {}", response.status()) }),
        );
    }
    let data = response.json::<Value>().map_err(|e| e.to_string())?;
    let Some(access_token) = data.get("access_token").and_then(Value::as_str) else {
        return Ok(json!({ "success": false, "error": "Token 交换响应无效" }));
    };
    let Some(refresh_token) = data.get("refresh_token").and_then(Value::as_str) else {
        return Ok(json!({ "success": false, "error": "Token 交换响应无效" }));
    };
    let expires_in = data
        .get("expires_in")
        .and_then(Value::as_i64)
        .unwrap_or(3600);
    set_config(
        "onedriveConfig",
        json!({
          "clientId": client_id,
          "accessToken": access_token,
          "refreshToken": refresh_token,
          "expiresAt": chrono::Utc::now().timestamp_millis() + expires_in * 1000,
          "folder": "/Nexusky"
        }),
    )?;
    Ok(json!({ "success": true }))
}

fn cloud_push_file(vault_path: &str, file_path: &str) -> Result<bool, String> {
    match active_sync_provider().as_str() {
        "icloud" => icloud_push_file(Path::new(vault_path), Path::new(file_path)),
        "supabase" => supabase_push_file(Path::new(vault_path), Path::new(file_path)),
        "onedrive" => onedrive_push_file(Path::new(vault_path), Path::new(file_path)),
        _ => Ok(false),
    }
}

fn cloud_pull_file(vault_path: &str, rel_path: &str) -> Result<bool, String> {
    match active_sync_provider().as_str() {
        "icloud" => icloud_pull_file(Path::new(vault_path), rel_path),
        "supabase" => supabase_pull_file(Path::new(vault_path), rel_path),
        "onedrive" => onedrive_pull_file(Path::new(vault_path), rel_path),
        _ => Ok(false),
    }
}

fn cloud_sync(vault_path: &str, pull_only: bool) -> Result<Value, String> {
    match active_sync_provider().as_str() {
        "icloud" => icloud_sync(Path::new(vault_path), pull_only),
        "supabase" => supabase_sync(Path::new(vault_path), pull_only),
        "onedrive" => {
            let local_files = collect_sync_files(Path::new(vault_path));
            let mut pushed = 0;
            let mut errors = Vec::<String>::new();
            if !pull_only {
                for file in &local_files {
                    if onedrive_push_file(Path::new(vault_path), file).unwrap_or(false) {
                        pushed += 1;
                    } else {
                        errors.push(format!("push failed: {}", file.to_string_lossy()));
                    }
                }
            }
            Ok(
                json!({ "total": local_files.len(), "pushed": pushed, "pulled": 0, "conflicts": [], "errors": errors }),
            )
        }
        _ => Ok(
            json!({ "total": 0, "pushed": 0, "pulled": 0, "conflicts": [], "errors": ["未配置同步后端"] }),
        ),
    }
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
        "ai:detect-local-config" => Ok(Some(detect_local_ai_config())),
        "ai:list-ollama-models" => Ok(Some(list_ollama_models(
            params.get("baseUrl").and_then(Value::as_str),
        ))),
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
        "cloud:init" => Ok(Some(active_cloud_test_connection(&active_sync_provider()))),
        "cloud:sign-in" | "cloud:sign-up" => Ok(Some(json!({
          "success": supabase_config().is_some(),
          "error": if supabase_config().is_some() { Value::Null } else { Value::String("未配置 Supabase".into()) }
        }))),
        "cloud:get-user" => Ok(Some(Value::Null)),
        "cloud:sign-out" | "cloud:set-online" => Ok(Some(Value::Null)),
        "cloud:onedrive-auth" => Ok(Some(onedrive_auth(as_str(&params, "clientId")?)?)),
        "cloud:sync" => Ok(Some(cloud_sync(as_str(&params, "vaultPath")?, false)?)),
        "cloud:pull-all" => Ok(Some(cloud_sync(as_str(&params, "vaultPath")?, true)?)),
        "cloud:push-file" => Ok(Some(Value::Bool(cloud_push_file(
            as_str(&params, "vaultPath")?,
            as_str(&params, "filePath")?,
        )?))),
        "cloud:pull-file" => Ok(Some(Value::Bool(cloud_pull_file(
            as_str(&params, "vaultPath")?,
            as_str(&params, "relPath")?,
        )?))),
        "cloud:push-index" => {
            let vault = as_str(&params, "vaultPath")?;
            Ok(Some(Value::Bool(cloud_push_file(
                vault,
                &Path::new(vault)
                    .join(".nexusky")
                    .join("index.db")
                    .to_string_lossy(),
            )?)))
        }
        "cloud:pull-index" => Ok(Some(Value::Bool(cloud_pull_file(
            as_str(&params, "vaultPath")?,
            ".nexusky/index.db",
        )?))),
        "cloud:sync-index" => {
            let vault = as_str(&params, "vaultPath")?;
            let pulled = cloud_pull_file(vault, ".nexusky/index.db")?;
            let pushed = if !pulled {
                cloud_push_file(
                    vault,
                    &Path::new(vault)
                        .join(".nexusky")
                        .join("index.db")
                        .to_string_lossy(),
                )?
            } else {
                false
            };
            Ok(Some(json!({ "pushed": pushed, "pulled": pulled })))
        }
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
        "cloud:test-connection" => Ok(Some(active_cloud_test_connection(
            params
                .get("provider")
                .and_then(Value::as_str)
                .unwrap_or(&active_sync_provider()),
        ))),
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
        "cloud:get-queue-size" => Ok(Some(Value::Number(0.into()))),
        "cloud:resolve-conflict" => {
            let vault = as_str(&params, "vaultPath")?;
            let rel = as_str(&params, "path")?;
            if params
                .get("resolution")
                .and_then(Value::as_str)
                .unwrap_or("local")
                == "remote"
            {
                Ok(Some(Value::Bool(cloud_pull_file(vault, rel)?)))
            } else {
                Ok(Some(Value::Bool(cloud_push_file(
                    vault,
                    &Path::new(vault).join(rel).to_string_lossy(),
                )?)))
            }
        }
        "updater:check" => Ok(Some(json!({ "available": false }))),
        "updater:download" | "updater:install" => Ok(Some(Value::Null)),
        "export:html" => {
            let title = as_str(&params, "title")?;
            let Some(path) = save_dialog(&format!("{title}.html"), "html", "HTML") else {
                return Ok(Some(Value::Bool(false)));
            };
            fs::write(
                path,
                export_html_document(title, as_str(&params, "content")?, false),
            )
            .map_err(|e| e.to_string())?;
            Ok(Some(Value::Bool(true)))
        }
        "export:pdf" => {
            let title = as_str(&params, "title")?;
            let Some(path) = save_dialog(&format!("{title}.pdf"), "pdf", "PDF") else {
                return Ok(Some(Value::Bool(false)));
            };
            export_pdf(title, as_str(&params, "content")?, &path)?;
            Ok(Some(Value::Bool(true)))
        }
        "export:share" => {
            let html =
                export_html_document(as_str(&params, "title")?, as_str(&params, "content")?, true);
            let _ = write_clipboard(&html);
            Ok(Some(Value::String(html)))
        }
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_share_html_contains_rendered_markdown() {
        let html = export_html_document("Title", "# Heading\n\n- one\n- two", true);
        assert!(html.contains("<h1>Heading</h1>"));
        assert!(html.contains("<li>one</li>"));
        assert!(html.contains("由 Nexusky 生成"));
    }

    #[test]
    fn simple_pdf_writes_valid_header() {
        let pdf = simple_pdf("Title", "hello");
        assert!(pdf.starts_with(b"%PDF-1.4"));
        assert!(pdf.ends_with(b"%%EOF\n"));
    }

    #[test]
    fn validates_openai_api_key_shape() {
        assert!(is_usable_openai_key("sk-test_123"));
        assert!(!is_usable_openai_key("sess-not-an-api-key"));
        assert!(!is_usable_openai_key(""));
    }
}

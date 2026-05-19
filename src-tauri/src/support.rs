use serde_json::{json, Value};
use std::fs;
use std::io::Write;
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
}

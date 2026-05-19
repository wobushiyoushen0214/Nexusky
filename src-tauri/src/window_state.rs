use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow, WindowEvent};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowBounds {
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
    is_maximized: Option<bool>,
}

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

fn read_bounds() -> Option<WindowBounds> {
    serde_json::from_value(read_config().get("windowBounds")?.clone()).ok()
}

fn write_bounds(bounds: WindowBounds) -> Result<(), String> {
    let mut config = read_config();
    config["windowBounds"] = serde_json::to_value(bounds).map_err(|e| e.to_string())?;
    write_config(&config)
}

fn save_window_bounds(window: &WebviewWindow) {
    let is_maximized = window.is_maximized().unwrap_or(false);
    if is_maximized {
        let mut bounds = read_bounds().unwrap_or_default();
        bounds.is_maximized = Some(true);
        let _ = write_bounds(bounds);
        return;
    }

    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };

    let _ = write_bounds(WindowBounds {
        x: Some(position.x),
        y: Some(position.y),
        width: Some(size.width),
        height: Some(size.height),
        is_maximized: Some(false),
    });
}

fn restore_bounds(window: &WebviewWindow) {
    let Some(bounds) = read_bounds() else {
        return;
    };

    if let (Some(width), Some(height)) = (bounds.width, bounds.height) {
        if width >= 800 && height >= 600 {
            let _ = window.set_size(Size::Physical(PhysicalSize::new(width, height)));
        }
    }

    if let (Some(x), Some(y)) = (bounds.x, bounds.y) {
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
    }

    if bounds.is_maximized.unwrap_or(false) {
        let _ = window.maximize();
    }
}

pub fn restore_and_watch(window: &WebviewWindow) {
    restore_bounds(window);

    let window_for_events = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_)
        | WindowEvent::Resized(_)
        | WindowEvent::CloseRequested { .. }
        | WindowEvent::Destroyed => save_window_bounds(&window_for_events),
        _ => {}
    });
}

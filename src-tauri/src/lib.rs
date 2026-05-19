mod ai;
mod commands;
mod db;
mod files;
mod global_shortcut;
mod support;
mod vault;
mod watcher;
mod window_state;

use serde_json::Value;
use tauri::Manager;

#[tauri::command]
async fn api_invoke(
    channel: String,
    params: Value,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    commands::dispatch(&app, &channel, params)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window_state::restore_and_watch(&window);
            }
            global_shortcut::register_quick_capture(app.handle().clone());
            support::start_update_check(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![api_invoke])
        .run(tauri::generate_context!())
        .expect("error while running Nexusky Tauri application");
}

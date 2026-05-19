mod commands;
mod db;
mod files;
mod vault;

use serde_json::Value;

#[tauri::command]
async fn api_invoke(channel: String, params: Value, app: tauri::AppHandle) -> Result<Value, String> {
  commands::dispatch(&app, &channel, params)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![api_invoke])
    .run(tauri::generate_context!())
    .expect("error while running Nexusky Tauri application");
}

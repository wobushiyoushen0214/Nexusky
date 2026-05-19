use serde_json::Value;

pub fn dispatch(_app: &tauri::AppHandle, channel: &str, params: Value) -> Result<Value, String> {
    if let Some(value) = crate::files::handle(Some(_app), channel, params.clone())? {
        return Ok(value);
    }
    if let Some(value) = crate::vault::handle(_app, channel, params.clone())? {
        return Ok(value);
    }
    if let Some(value) = crate::db::handle(Some(_app), channel, params.clone())? {
        return Ok(value);
    }
    if let Some(value) = crate::support::handle(channel, params.clone())? {
        return Ok(value);
    }
    if let Some(value) = crate::ai::handle(_app, channel, params)? {
        return Ok(value);
    }

    Err(format!("Tauri channel is not migrated yet: {channel}"))
}

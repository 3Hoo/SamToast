// SamToast — Claude Code hooks configuration writer
//
// Writes hook entries into %USERPROFILE%\.claude\settings.json so that
// Claude Code forwards lifecycle events to our local HTTP server.

use serde_json::{json, Value};

/// Build the hooks JSON object for the given enabled events and port.
fn build_hooks_object(port: u16, enabled_events: &[String]) -> Value {
    let mut hooks = serde_json::Map::new();

    for event in enabled_events {
        let hook_entry = json!([{
            "matcher": "",
            "hooks": [{
                "type": "command",
                "command": format!(
                    "curl -s -X POST http://localhost:{}/hook -H \"Content-Type: application/json\" -d @-",
                    port
                )
            }]
        }]);
        hooks.insert(event.clone(), hook_entry);
    }

    Value::Object(hooks)
}

/// Configure Claude Code hooks in %USERPROFILE%\.claude\settings.json.
///
/// - Creates the file if it does not exist.
/// - Backs up a corrupt/unparseable file to settings.json.bak before overwriting.
/// - Merges only SamToast-managed event entries; preserves all other keys.
///
/// On write failure returns `Err` containing the JSON string so the caller can
/// put it on the clipboard.
pub fn configure_hooks(port: u16, enabled_events: &[String]) -> Result<(), String> {
    let claude_dir = get_claude_dir()?;
    let settings_path = claude_dir.join("settings.json");

    // Load or create the settings JSON.
    let mut root: Value = if settings_path.exists() {
        let raw = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("settings.json 읽기 실패: {e}"))?;

        match serde_json::from_str::<Value>(&raw) {
            Ok(v) => v,
            Err(e) => {
                // Back up the corrupt file before starting fresh.
                let bak_path = claude_dir.join("settings.json.bak");
                eprintln!("[hooks_config] settings.json parse error ({e}); backing up to {bak_path:?}");
                let _ = std::fs::copy(&settings_path, &bak_path);
                json!({})
            }
        }
    } else {
        json!({})
    };

    // Ensure "hooks" key exists as an object.
    if !root.get("hooks").map(|v| v.is_object()).unwrap_or(false) {
        root["hooks"] = json!({});
    }

    let hooks_obj = root["hooks"].as_object_mut().unwrap();

    // All known event names we manage.
    let all_managed_events = [
        "Stop",
        "Notification",
        "PreToolUse",
        "PostToolUse",
        "SubagentStop",
    ];

    // Remove previously managed entries that are now disabled.
    for event in &all_managed_events {
        if !enabled_events.iter().any(|e| e == event) {
            hooks_obj.remove(*event);
        }
    }

    // Insert / overwrite entries for enabled events.
    let new_hooks = build_hooks_object(port, enabled_events);
    if let Some(new_obj) = new_hooks.as_object() {
        for (k, v) in new_obj {
            hooks_obj.insert(k.clone(), v.clone());
        }
    }

    // Serialize with pretty printing.
    let json_str = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("JSON 직렬화 실패: {e}"))?;

    // Attempt to write; on failure return the JSON so the frontend can copy it.
    match std::fs::write(&settings_path, &json_str) {
        Ok(_) => Ok(()),
        Err(e) => {
            eprintln!("[hooks_config] Write failed: {e}");
            Err(format!(
                "권한 없음. 클립보드에 설정 JSON 복사됨\n{}",
                json_str
            ))
        }
    }
}

/// Resolve %USERPROFILE%\.claude, creating the directory if needed.
fn get_claude_dir() -> Result<std::path::PathBuf, String> {
    let profile = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "USERPROFILE / HOME 환경변수를 찾을 수 없습니다".to_string())?;

    let claude_dir = std::path::PathBuf::from(profile).join(".claude");

    if !claude_dir.exists() {
        std::fs::create_dir_all(&claude_dir)
            .map_err(|e| format!(".claude 디렉토리 생성 실패: {e}"))?;
    }

    Ok(claude_dir)
}

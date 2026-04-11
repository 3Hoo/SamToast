// FunnyToastAlarm — Tauri commands (Phase 5a)

use crate::{config, focus, hooks_config, AppState};
use crate::config::AppConfig;

// ---------------------------------------------------------------------------
// get_config
// ---------------------------------------------------------------------------

/// Return the current AppConfig to the frontend.
#[tauri::command]
pub fn get_config(state: tauri::State<AppState>) -> AppConfig {
    state.config.read().unwrap().clone()
}

// ---------------------------------------------------------------------------
// save_config
// ---------------------------------------------------------------------------

/// Persist an updated AppConfig coming from the settings GUI.
#[tauri::command]
pub fn save_config(
    state: tauri::State<AppState>,
    config: AppConfig,
) -> Result<(), String> {
    let exe_dir = state.exe_dir.clone();
    *state.config.write().unwrap() = config.clone();
    config::save_config(&exe_dir, &config)
}

// ---------------------------------------------------------------------------
// set_auto_start
// ---------------------------------------------------------------------------

/// Enable or disable launching this app on Windows login via the registry.
#[tauri::command]
pub fn set_auto_start(enabled: bool, _app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::core::PCWSTR;
        use windows::Win32::System::Registry::{
            RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW,
            HKEY_CURRENT_USER, KEY_SET_VALUE, REG_SZ,
        };

        // Get the current exe path for the registry value.
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("현재 exe 경로를 얻을 수 없습니다: {e}"))?;
        let exe_str = exe_path
            .to_str()
            .ok_or_else(|| "exe 경로가 유효한 UTF-8이 아닙니다".to_string())?;

        let reg_path: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run\0"
            .encode_utf16()
            .collect();
        let value_name: Vec<u16> = "FunnyToastAlarm\0".encode_utf16().collect();

        unsafe {
            let mut hkey = windows::Win32::System::Registry::HKEY::default();
            let result = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(reg_path.as_ptr()),
                0,
                KEY_SET_VALUE,
                &mut hkey,
            );
            result.ok().map_err(|e| format!("레지스트리 키 열기 실패: {e}"))?;

            if enabled {
                // Encode exe path as UTF-16 (with null terminator) for REG_SZ.
                let value_data: Vec<u8> = exe_str
                    .encode_utf16()
                    .chain(std::iter::once(0u16))
                    .flat_map(|c| c.to_le_bytes())
                    .collect();

                let result = RegSetValueExW(
                    hkey,
                    PCWSTR(value_name.as_ptr()),
                    0,
                    REG_SZ,
                    Some(&value_data),
                );
                let _ = RegCloseKey(hkey);
                result.ok().map_err(|e| format!("레지스트리 값 쓰기 실패: {e}"))?;
            } else {
                let result = RegDeleteValueW(hkey, PCWSTR(value_name.as_ptr()));
                let _ = RegCloseKey(hkey);
                // Ignore "value not found" errors (ERROR_FILE_NOT_FOUND = 2).
                if let Err(e) = result.ok() {
                    if e.code().0 as u32 != 2 {
                        return Err(format!("레지스트리 값 삭제 실패: {e}"));
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (enabled, app);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// configure_claude_hooks
// ---------------------------------------------------------------------------

/// Write FunnyToastAlarm hook entries into Claude Code's settings.json.
///
/// Reads the current config to determine which events are enabled and which
/// port the HTTP server is listening on.
#[tauri::command]
pub fn configure_claude_hooks(state: tauri::State<AppState>) -> Result<String, String> {
    let (port, enabled_events) = {
        let cfg = state.config.read().unwrap();
        let port = cfg.port;
        let enabled: Vec<String> = cfg
            .events
            .iter()
            .filter(|(_, ev)| ev.enabled)
            .map(|(name, _)| name.clone())
            .collect();
        (port, enabled)
    };

    hooks_config::configure_hooks(port, &enabled_events)
}

// ---------------------------------------------------------------------------
// on_notification_click  (Phase 4b — stub with session focus)
// ---------------------------------------------------------------------------

/// Called when the user clicks a notification toast window.
///
/// Optionally focuses the originating Claude Code terminal window, then hides
/// the notification. Full close-animation support is deferred to Phase 6.
#[tauri::command]
pub async fn on_notification_click(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let (focus_session, _close_behavior) = {
        let cfg = state.config.read().unwrap();
        (
            cfg.notification.on_click_focus_session,
            cfg.notification.on_click_close.clone(),
        )
    };

    if focus_session {
        // Window label format: "notification-<session_id>"
        let session_id = window.label().trim_start_matches("notification-");
        let pid = {
            let sessions = state.sessions.lock().unwrap();
            sessions.get(session_id).and_then(|s| s.pid)
        };
        if let Some(pid) = pid {
            focus::focus_session_window(pid);
        }
    }

    window.hide().map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// on_notification_closing  (Phase 4b — stub)
// ---------------------------------------------------------------------------

/// Called by the frontend after its closing animation completes.
///
/// Hides the notification window. Full cleanup logic deferred to Phase 6.
#[tauri::command]
pub async fn on_notification_closing(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

// FunnyToastAlarm - Notification window backend

use std::time::Duration;

use tauri::{
    Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};
use tokio_util::sync::CancellationToken;

use crate::config::{EventConfig, SharedConfig};
use crate::server::HookEvent;
use crate::session::{NotificationStatus, SessionState, SharedSessions};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOTIF_MARGIN: f64 = 20.0;

// ---------------------------------------------------------------------------
// DPI helpers  (Step 4-3)
// ---------------------------------------------------------------------------

fn get_bottom_right_position(
    monitor: &tauri::Monitor,
    window_width: f64,
    window_height: f64,
    margin: f64,
) -> tauri::PhysicalPosition<i32> {
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    let scale = monitor.scale_factor();

    // Calculate in logical pixels, then convert to physical
    let logical_x = (monitor_size.width as f64 / scale) - window_width - margin;
    let logical_y = (monitor_size.height as f64 / scale) - window_height - margin;

    tauri::PhysicalPosition::new(
        (monitor_pos.x as f64 + logical_x * scale) as i32,
        (monitor_pos.y as f64 + logical_y * scale) as i32,
    )
}

// ---------------------------------------------------------------------------
// Notification payload sent to the frontend
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize)]
pub struct NotificationShowPayload {
    pub session_id: String,
    pub event_name: String,
    pub cwd: Option<String>,
    pub event_config: EventConfig,
}

// ---------------------------------------------------------------------------
// Timeout (Step 4-7)
// ---------------------------------------------------------------------------

pub async fn start_timeout(
    window: tauri::WebviewWindow,
    timeout_secs: u64,
    cancel_token: CancellationToken,
) {
    if timeout_secs == 0 {
        return;
    }

    tokio::select! {
        _ = tokio::time::sleep(Duration::from_secs(timeout_secs)) => {
            // Notify frontend to start closing animation / hide (emit_to = this window only)
            window.emit_to(window.label(), "notification-closing", ()).ok();
            // Frontend animation grace period, then hide unconditionally as fallback
            tokio::time::sleep(Duration::from_millis(600)).await;
            window.hide().ok();
        }
        _ = cancel_token.cancelled() => {
            // A new hook event arrived; the caller will restart the timer
        }
    }
}

// ---------------------------------------------------------------------------
// Main entry point (Step 4-1)
// ---------------------------------------------------------------------------

pub async fn handle_hook_event(
    app: tauri::AppHandle,
    event: HookEvent,
    sessions: SharedSessions,
    config: SharedConfig,
    exe_dir: std::path::PathBuf,
) {
    let session_id = event.payload.session_id.clone();
    let event_name = event.payload.hook_event_name.clone();
    let cwd = event.payload.cwd.clone();
    let pid = event.payload.pid;

    // Sanitize session_id for use as Tauri window label suffix.
    // Registry keys always use safe_id so on_notification_click can look up
    // by stripping the "notification-" prefix from the window label.
    let safe_id: String = session_id
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();

    // Retrieve timeout + window size settings before taking any locks
    let timeout_secs = config
        .read()
        .map(|c| c.notification.timeout_secs)
        .unwrap_or(5);

    let (notif_width, notif_height) = config
        .read()
        .map(|c| (c.notification.window_width as f64, c.notification.window_height as f64))
        .unwrap_or((360.0, 130.0));

    // Retrieve event-specific config (sound, image, animation settings)
    let (sound_path, sound_loop, event_cfg): (Option<String>, bool, EventConfig) = config
        .read()
        .ok()
        .and_then(|c| {
            c.events.get(&event_name).map(|e| (e.sound_path.clone(), e.sound_loop, e.clone()))
        })
        .unwrap_or_else(|| (None, false, EventConfig::default()));

    // Check if the session already exists (keyed by safe_id).
    let existing_label: Option<String> = sessions
        .lock()
        .ok()
        .and_then(|reg| reg.get(&safe_id).map(|s| s.window_label.clone()));

    if let Some(window_label) = existing_label {
        // ----------------------------------------------------------------
        // Existing session: re-show window and emit update event
        // ----------------------------------------------------------------
        if let Some(window) = app.get_webview_window(&window_label) {
            window.show().ok();
            // Resize to current config dimensions (user may have changed them)
            window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: notif_width,
                height: notif_height,
            })).ok();

            // Cancel any running timeout, then issue a fresh token
            let new_token = CancellationToken::new();
            if let Ok(mut reg) = sessions.lock() {
                if let Some(state) = reg.get_mut(&safe_id) {
                    // Explicitly cancel the old token so the running task wakes up
                    if let Some(old) = state.cancel_token.take() {
                        old.cancel();
                    }
                    state.status = NotificationStatus::Active;
                    state.cwd = cwd.clone();
                    state.cancel_token = Some(new_token.clone());
                }
            }

            // Emit show event to this window only (not broadcast)
            window
                .emit_to(
                    window.label(),
                    "notification-show",
                    NotificationShowPayload {
                        session_id: session_id.clone(),
                        event_name,
                        cwd,
                        event_config: event_cfg.clone(),
                    },
                )
                .ok();

            // Play sound — pass cancel token so looping sound stops with the notification
            let sound_path_owned = sound_path.clone();
            let sound_cancel = new_token.clone();
            tokio::task::spawn_blocking(move || {
                crate::sound::play_notification_sound(sound_path_owned.as_deref(), sound_loop, &sound_cancel);
            });

            // Restart timeout
            let window_clone = window.clone();
            tauri::async_runtime::spawn(async move {
                start_timeout(window_clone, timeout_secs, new_token).await;
            });
        }
    } else {
        // ----------------------------------------------------------------
        // New session: create window  (Step 4-1)
        // ----------------------------------------------------------------

        let window_label = format!("notification-{}", safe_id);

        // Look up saved position from config
        let saved_pos: Option<(i32, i32)> = config
            .read()
            .ok()
            .and_then(|c| c.sessions.get(&session_id).map(|p| (p.window_x, p.window_y)));

        // Fix 1: Register session state BEFORE calling builder.build()
        let cancel_token = CancellationToken::new();
        {
            if let Ok(mut reg) = sessions.lock() {
                let mut state = SessionState::with_context(
                    session_id.clone(),
                    window_label.clone(),
                    cwd.clone(),
                    pid,
                );
                state.status = NotificationStatus::Active;
                state.cancel_token = Some(cancel_token.clone());
                // Key by safe_id so on_notification_click can look up by window label suffix.
                reg.upsert(safe_id.clone(), state);
            }
        }

        let builder = WebviewWindowBuilder::new(
            &app,
            &window_label,
            WebviewUrl::App("src/notification/index.html".into()),
        )
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .visible(false)
        .inner_size(notif_width, notif_height);

        let window = match builder.build() {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[notification] Failed to create window for {session_id}: {e}");
                // Clean up session registration since window creation failed
                if let Ok(mut reg) = sessions.lock() {
                    reg.remove(&safe_id);
                }
                return;
            }
        };

        // Position the window (Step 4-3)
        if let Some((x, y)) = saved_pos {
            // Saved position is in logical pixels; convert to physical
            let scale = window
                .current_monitor()
                .ok()
                .flatten()
                .map(|m| m.scale_factor())
                .unwrap_or(1.0);
            let phys = tauri::PhysicalPosition::new(
                (x as f64 * scale) as i32,
                (y as f64 * scale) as i32,
            );
            window.set_position(phys).ok();
        } else if let Ok(Some(monitor)) = window.current_monitor() {
            let pos = get_bottom_right_position(&monitor, notif_width, notif_height, NOTIF_MARGIN);
            window.set_position(pos).ok();
        }

        // Step 4-2: Listen for move events to persist position
        // Fix 5: also save config to disk on move
        {
            let window_clone = window.clone();
            let config_clone = config.clone();
            let session_id_clone = session_id.clone();
            let exe_dir_clone = exe_dir.clone();

            window.on_window_event(move |ev| {
                if let WindowEvent::Moved(pos) = ev {
                    let scale = window_clone
                        .current_monitor()
                        .ok()
                        .flatten()
                        .map(|m| m.scale_factor())
                        .unwrap_or(1.0);
                    let logical_x = (pos.x as f64 / scale) as i32;
                    let logical_y = (pos.y as f64 / scale) as i32;

                    if let Ok(mut cfg) = config_clone.write() {
                        cfg.sessions.insert(
                            session_id_clone.clone(),
                            crate::config::SessionPos {
                                window_x: logical_x,
                                window_y: logical_y,
                            },
                        );
                    }
                    // Persist updated position to disk
                    if let Ok(cfg) = config_clone.read() {
                        let _ = crate::config::save_config(&exe_dir_clone, &cfg);
                    }
                }
            });
        }

        window.show().ok();

        // Listen for frontend to be ready before emitting the initial payload
        let payload = NotificationShowPayload {
            session_id: session_id.clone(),
            event_name,
            cwd,
            event_config: event_cfg,
        };
        
        let window_clone_emit = window.clone();
        window.once("notification-ready", move |_| {
            // emit_to: send only to this specific window, not all windows
            window_clone_emit.emit_to(window_clone_emit.label(), "notification-show", payload).ok();
        });

        // Play sound — pass cancel token so looping sound stops with the notification
        let sound_path_owned = sound_path.clone();
        let sound_cancel = cancel_token.clone();
        tokio::task::spawn_blocking(move || {
            crate::sound::play_notification_sound(sound_path_owned.as_deref(), sound_loop, &sound_cancel);
        });

        // Start timeout
        let window_clone = window.clone();
        tauri::async_runtime::spawn(async move {
            start_timeout(window_clone, timeout_secs, cancel_token).await;
        });
    }
}

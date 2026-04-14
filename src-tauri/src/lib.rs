// SamToast - Tauri application entry point

pub mod commands;
pub mod config;
pub mod focus;
pub mod hooks_config;
pub mod notification;
pub mod server;
pub mod session;
pub mod sound;

use config::SharedConfig;
use server::HookEvent;
use session::SharedSessions;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tokio::sync::mpsc;

const HOOK_CHANNEL_CAPACITY: usize = 32;

/// App-wide state container
pub struct AppState {
    pub config: SharedConfig,
    /// Directory next to the executable — used for portable config storage.
    pub exe_dir: std::path::PathBuf,
    /// Receiver for hook events; consumed by Phase 3/4 notification logic.
    /// Wrapped in a Mutex so it can be moved out of shared state when needed.
    pub event_rx: std::sync::Mutex<Option<mpsc::Receiver<HookEvent>>>,
    /// Registry for tracking Claude Code sessions and their notification states
    pub sessions: SharedSessions,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Resolve the directory next to the executable for portable config storage.
    let exe_dir = std::env::current_exe()
        .unwrap_or_else(|_| {
            eprintln!("[config] Warning: could not resolve exe path, using cwd");
            std::path::PathBuf::from(".")
        })
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let config = config::init_config(&exe_dir);
    let (tx, rx) = mpsc::channel::<HookEvent>(HOOK_CHANNEL_CAPACITY);
    let sessions = session::SharedSessions::new(std::sync::Mutex::new(
        session::SessionRegistry::new(),
    ));

    let state = AppState {
        config,
        exe_dir: exe_dir.clone(),
        event_rx: std::sync::Mutex::new(Some(rx)),
        sessions,
    };

    let exe_dir_for_setup = exe_dir.clone();

    // Clone for exit handler — must happen before move into Builder
    let exe_dir_for_exit = exe_dir.clone();
    let config_for_exit = state.config.clone();
    let sessions_for_exit = state.sessions.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state)
        .setup(move |app| {
            let exe_dir = exe_dir_for_setup;
            let handle = app.handle().clone();
            let app_state = app.state::<AppState>();
            let config = app_state.config.clone();
            let sessions = app_state.sessions.clone();
            let port = {
                config
                    .read()
                    .map(|c| c.port)
                    .unwrap_or(12759)
            };

            // --- Step 6-1: Build tray icon with menu ---
            let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_item])?;

            // TrayIconBuilder::build() registers the icon in the app's resource table.
            // The returned TrayIcon handle can be dropped safely; the icon persists
            // and is retrievable anytime via app.tray_by_id("main").
            TrayIconBuilder::with_id("main")
                .icon(
                    app.default_window_icon()
                        .ok_or("No default window icon configured")?
                        .clone(),
                )
                .tooltip("SamToast")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Filter to Release only — Click fires on both Press and Release,
                    // so without this filter the window toggles twice per click.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("settings") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // --- Step 6-2: Spawn HTTP server ---
            // Clone handle to propagate port-conflict warning to tray tooltip.
            let handle_for_server = handle.clone();
            let config_clone = config.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = server::start_server(port, config_clone, tx).await {
                    eprintln!("[server] Failed to start on port {port}: {e}");
                    // Show warning via tray tooltip — no new icon file required.
                    if let Some(tray) = handle_for_server.tray_by_id("main") {
                        let _ = tray.set_tooltip(Some(
                            "SamToast — 포트 충돌! 설정에서 포트를 변경하세요.",
                        ));
                    }
                }
            });

            // Consume hook events and dispatch to notification handler
            let rx = app_state.event_rx.lock().unwrap().take();
            if let Some(mut rx) = rx {
                let handle_clone = handle.clone();
                let sessions_clone = sessions.clone();
                let config_clone = config.clone();
                let exe_dir_clone = exe_dir.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        notification::handle_hook_event(
                            handle_clone.clone(),
                            event,
                            sessions_clone.clone(),
                            config_clone.clone(),
                            exe_dir_clone.clone(),
                        )
                        .await;
                    }
                    eprintln!("[notification] Event channel closed");
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::set_auto_start,
            commands::configure_claude_hooks,
            commands::on_notification_click,
            commands::on_notification_closing,
        ])
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        // --- Step 6-3: Exit cleanup ---
        .run(move |app, event| {
            match event {
                tauri::RunEvent::ExitRequested { .. } => {
                    // Close all notification windows before they are destroyed.
                    // ExitRequested fires while windows still exist; Exit fires after
                    // they are already gone, so win.close() would be a no-op there.
                    let session_ids: Vec<String> = sessions_for_exit
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .session_ids();
                    for id in session_ids {
                        let label = format!("notification-{id}");
                        if let Some(win) = app.get_webview_window(&label) {
                            let _ = win.close();
                        }
                    }
                }
                tauri::RunEvent::Exit => {
                    // Final config save (positions are persisted on window move;
                    // this ensures nothing is lost if the process exits abruptly).
                    // File I/O is safe here even though windows are already gone.
                    if let Ok(cfg) = config_for_exit.read() {
                        let _ = config::save_config(&exe_dir_for_exit, &cfg);
                    }
                }
                _ => {}
            }
        });
}

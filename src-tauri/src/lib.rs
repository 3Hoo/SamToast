// FunnyToastAlarm - Tauri application entry point

pub mod config;
pub mod focus;
pub mod notification;
pub mod server;
pub mod session;
pub mod sound;

use config::SharedConfig;
use server::HookEvent;
use session::SharedSessions;
use tauri::Manager;
use tokio::sync::mpsc;

const HOOK_CHANNEL_CAPACITY: usize = 32;

/// App-wide state container (to be expanded in later phases)
pub struct AppState {
    pub config: SharedConfig,
    /// Receiver for hook events; consumed by Phase 3/4 notification logic.
    /// Wrapped in a Mutex so it can be moved out of shared state when needed.
    pub event_rx: std::sync::Mutex<Option<mpsc::Receiver<HookEvent>>>,
    /// Registry for tracking Claude Code sessions and their notification states
    pub sessions: SharedSessions,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Resolve the directory next to the executable for portable config storage
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
        event_rx: std::sync::Mutex::new(Some(rx)),
        sessions,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .setup(|app| {
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

            // Spawn HTTP server
            {
                let config_clone = config.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = server::start_server(port, config_clone, tx).await {
                        eprintln!("[server] Failed to start on port {port}: {e}");
                    }
                });
            }

            // Consume hook events and dispatch to notification handler (Step lib.rs)
            let rx = app_state.event_rx.lock().unwrap().take();
            if let Some(mut rx) = rx {
                let handle_clone = handle.clone();
                let sessions_clone = sessions.clone();
                let config_clone = config.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        notification::handle_hook_event(
                            handle_clone.clone(),
                            event,
                            sessions_clone.clone(),
                            config_clone.clone(),
                        )
                        .await;
                    }
                    eprintln!("[notification] Event channel closed");
                });
            }

            let _ = handle; // retained for Phase 6

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// FunnyToastAlarm - Tauri application entry point

pub mod config;
pub mod server;

use config::SharedConfig;
use server::HookEvent;
use tauri::Manager;
use tokio::sync::mpsc;

/// App-wide state container (to be expanded in later phases)
pub struct AppState {
    pub config: SharedConfig,
    /// Receiver for hook events; consumed by Phase 3/4 notification logic.
    /// Wrapped in a Mutex so it can be moved out of shared state when needed.
    pub event_rx: std::sync::Mutex<Option<mpsc::Receiver<HookEvent>>>,
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
    let (tx, rx) = mpsc::channel::<HookEvent>(32);

    let state = AppState {
        config,
        event_rx: std::sync::Mutex::new(Some(rx)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .setup(|app| {
            let app_state = app.state::<AppState>();
            let config = app_state.config.clone();
            let port = {
                config
                    .read()
                    .map(|c| c.port)
                    .unwrap_or(12759)
            };

            tauri::async_runtime::spawn(async move {
                if let Err(e) = server::start_server(port, config, tx).await {
                    eprintln!("[server] Failed to start: {e}");
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

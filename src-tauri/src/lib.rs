// FunnyToastAlarm - Tauri application entry point
// Placeholder: actual implementation will be added in later phases

pub mod config;

use config::SharedConfig;

/// App-wide state container (to be expanded in later phases)
pub struct AppState {
    pub config: SharedConfig,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Resolve the directory next to the executable for portable config storage
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let shared_config = config::init_config(&exe_dir);

    let _state = AppState {
        config: shared_config,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Phase 6: .manage(_state) and commands will be wired here
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

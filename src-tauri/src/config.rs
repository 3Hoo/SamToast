use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, RwLock};

// 이미지 표시 영역
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ImageArea {
    pub width: u32,  // 논리 픽셀
    pub height: u32,
}

impl Default for ImageArea {
    fn default() -> Self {
        Self {
            width: 80,
            height: 80,
        }
    }
}

// 이벤트별 설정
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EventConfig {
    pub enabled: bool,
    pub sound_path: Option<String>,
    pub image_path: Option<String>,
    pub image_area: ImageArea,
    pub image_bg_color: String,     // hex e.g. "#000000"
    pub image_bg_opacity: f32,      // 0.0 ~ 1.0
    pub frame_interval_ms: u64,     // 애니메이션 프레임 간격
}

impl Default for EventConfig {
    fn default() -> Self {
        Self::new_enabled()
    }
}

impl EventConfig {
    fn new_enabled() -> Self {
        Self {
            enabled: true,
            sound_path: None,
            image_path: None,
            image_area: ImageArea::default(),
            image_bg_color: "#000000".to_string(),
            image_bg_opacity: 0.0,
            frame_interval_ms: 100,
        }
    }

    fn new_disabled() -> Self {
        Self {
            enabled: false,
            ..Self::new_enabled()
        }
    }
}

// 알림 클릭 시 닫기 동작
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnClickClose {
    Instant,  // 즉시 닫기
    Animate,  // 닫기 애니메이션 후 닫기
}

// 알림 동작 설정
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NotificationConfig {
    pub timeout_secs: u64,            // 0 = timeout 없음
    pub on_click_focus_session: bool,
    pub on_click_close: OnClickClose,
    pub close_image_path: Option<String>,
}

impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            timeout_secs: 5,
            on_click_focus_session: true,
            on_click_close: OnClickClose::Animate,
            close_image_path: None,
        }
    }
}

// 세션별 창 위치
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SessionPos {
    pub window_x: i32,
    pub window_y: i32,
}

// 최상위 앱 설정
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AppConfig {
    pub port: u16,
    pub auto_start: bool,
    pub notification: NotificationConfig,
    pub events: HashMap<String, EventConfig>,  // key: "Stop", "Notification" 등
    pub sessions: HashMap<String, SessionPos>, // key: session_id
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut events = HashMap::new();
        events.insert("Stop".to_string(), EventConfig::new_enabled());
        events.insert("Notification".to_string(), EventConfig::new_enabled());
        events.insert("PreToolUse".to_string(), EventConfig::new_disabled());
        events.insert("PostToolUse".to_string(), EventConfig::new_disabled());
        events.insert("SubagentStop".to_string(), EventConfig::new_disabled());

        Self {
            port: 12759,
            auto_start: false,
            notification: NotificationConfig::default(),
            events,
            sessions: HashMap::new(),
        }
    }
}

pub fn load_config(exe_dir: &Path) -> AppConfig {
    let config_path = exe_dir.join("config.json");

    match std::fs::read_to_string(&config_path) {
        Ok(contents) => match serde_json::from_str::<AppConfig>(&contents) {
            Ok(config) => config,
            Err(e) => {
                eprintln!("[config] Failed to parse config.json: {e}. Using defaults.");
                let default = AppConfig::default();
                // 파싱 실패 시에도 기본값으로 파일을 덮어쓰지 않음 (원본 보존)
                default
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let default = AppConfig::default();
            if let Err(write_err) = save_config(exe_dir, &default) {
                eprintln!("[config] Failed to create default config.json: {write_err}");
            }
            default
        }
        Err(e) => {
            eprintln!("[config] Failed to read config.json: {e}. Using defaults.");
            AppConfig::default()
        }
    }
}

pub fn save_config(exe_dir: &Path, config: &AppConfig) -> Result<(), String> {
    let config_path = exe_dir.join("config.json");
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    std::fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config.json: {e}"))
}

pub type SharedConfig = Arc<RwLock<AppConfig>>;

pub fn init_config(exe_dir: &Path) -> SharedConfig {
    let config = load_config(exe_dir);
    Arc::new(RwLock::new(config))
}

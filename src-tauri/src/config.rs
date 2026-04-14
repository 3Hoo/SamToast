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
    #[serde(default)]
    pub sound_loop: bool,            // true = 알림 닫힐 때까지 반복 재생
    pub image_path: Option<String>,
    pub image_area: ImageArea,
    pub image_bg_color: String,          // hex e.g. "#000000"
    pub image_bg_opacity: f32,           // 0.0 ~ 1.0
    pub frame_interval_ms: u64,          // 애니메이션 프레임 간격
    #[serde(default = "default_true")]
    pub animation_loop: bool,            // true = 반복, false = 마지막 프레임에서 정지
    // 이미지 렌더링 위치·크기 (컨테이너 기준 transform)
    #[serde(default)]
    pub image_offset_x: i32,
    #[serde(default)]
    pub image_offset_y: i32,
    #[serde(default = "default_scale")]
    pub image_scale: f32,           // 1.0 = 원본 크기
    // 이미지 컨테이너 위치 오프셋
    #[serde(default)]
    pub container_offset_x: i32,
    #[serde(default)]
    pub container_offset_y: i32,
    
    // 알림 배경 표시 여부 (false면 완전 투명, opacity 로직 무시)
    #[serde(default = "default_true")]
    pub bg_visible: bool,
    
    // 알림 창 텍스트 커스터마이징 및 위치/크기 조정
    #[serde(default)]
    pub label_app_name: Option<String>,      // None/빈칸 = 숨김
    #[serde(default)]
    pub app_name_offset_x: i32,
    #[serde(default)]
    pub app_name_offset_y: i32,
    #[serde(default = "default_scale")]
    pub app_name_scale: f32,

    #[serde(default = "default_true")]
    pub label_show_cwd: bool,
    #[serde(default)]
    pub cwd_offset_x: i32,
    #[serde(default)]
    pub cwd_offset_y: i32,
    #[serde(default = "default_scale")]
    pub cwd_scale: f32,

    #[serde(default = "default_true")]
    pub label_show_event_badge: bool,
    #[serde(default)]
    pub label_event_name: Option<String>,    // None = 이벤트 키 이름 (e.g. "Stop")
    #[serde(default)]
    pub badge_offset_x: i32,
    #[serde(default)]
    pub badge_offset_y: i32,
    #[serde(default = "default_scale")]
    pub badge_scale: f32,
}

fn default_true() -> bool { true }
fn default_scale() -> f32 { 1.0 }

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
            sound_loop: false,
            image_path: None,
            image_area: ImageArea::default(),
            image_bg_color: "#000000".to_string(),
            image_bg_opacity: 0.0,
            frame_interval_ms: 100,
            animation_loop: true,
            image_offset_x: 0,
            image_offset_y: 0,
            image_scale: 1.0,
            container_offset_x: 0,
            container_offset_y: 0,
            bg_visible: true,
            
            label_app_name: None,
            app_name_offset_x: 0,
            app_name_offset_y: 0,
            app_name_scale: 1.0,

            label_show_cwd: true,
            cwd_offset_x: 0,
            cwd_offset_y: 0,
            cwd_scale: 1.0,

            label_show_event_badge: true,
            label_event_name: None,
            badge_offset_x: 0,
            badge_offset_y: 0,
            badge_scale: 1.0,
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

fn default_notif_width() -> u32 { 360 }
fn default_notif_height() -> u32 { 130 }

// 알림 동작 설정
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NotificationConfig {
    pub timeout_secs: u64,            // 0 = timeout 없음
    pub on_click_focus_session: bool,
    pub on_click_close: OnClickClose,
    pub close_image_path: Option<String>,
    #[serde(default = "default_notif_width")]
    pub window_width: u32,            // 알림 창 너비 (논리 픽셀)
    #[serde(default = "default_notif_height")]
    pub window_height: u32,           // 알림 창 높이 (논리 픽셀)
}

impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            timeout_secs: 0,
            on_click_focus_session: true,
            on_click_close: OnClickClose::Animate,
            close_image_path: None,
            window_width: 360,
            window_height: 130,
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

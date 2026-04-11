// FunnyToastAlarm - HTTP server for receiving Claude Code hooks

use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Router,
};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;

use crate::config::SharedConfig;

/// Payload sent by Claude Code hook (unknown fields are ignored)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookPayload {
    pub session_id: String,
    pub hook_event_name: String, // "Stop", "Notification", "PreToolUse", etc.
    pub cwd: Option<String>,
    pub pid: Option<u32>,
    // All other fields are silently dropped
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

/// Internal event passed from the HTTP server to the main application
#[derive(Debug, Clone)]
pub struct HookEvent {
    pub payload: HookPayload,
}

/// Shared state injected into every axum handler
#[derive(Clone)]
struct ServerState {
    config: SharedConfig,
    event_tx: tokio::sync::mpsc::Sender<HookEvent>,
}

/// POST /hook handler
async fn handle_hook(
    State(state): State<ServerState>,
    Json(payload): Json<HookPayload>,
) -> impl IntoResponse {
    // Check whether this event type is enabled in config
    let enabled = {
        match state.config.read() {
            Ok(cfg) => cfg
                .events
                .get(&payload.hook_event_name)
                .map(|e| e.enabled)
                .unwrap_or(false),
            Err(e) => {
                eprintln!("[server] Config lock poisoned: {e}");
                false
            }
        }
    };

    if !enabled {
        // Return 200 immediately so Claude Code hook is not blocked
        return StatusCode::OK;
    }

    if let Err(e) = state.event_tx.send(HookEvent { payload: payload.clone() }).await {
        eprintln!("[server] Failed to deliver '{}' event (session: {}): {e}",
                  payload.hook_event_name, payload.session_id);
    }

    StatusCode::OK
}

/// Start the axum HTTP server on `127.0.0.1:{port}`.
///
/// The server is spawned as a background tokio task; this function returns once
/// the TCP socket is bound (or returns `Err` if binding fails).
pub async fn start_server(
    port: u16,
    shared_config: SharedConfig,
    event_tx: tokio::sync::mpsc::Sender<HookEvent>,
) -> Result<(), String> {
    let state = ServerState {
        config: shared_config,
        event_tx,
    };

    let app = Router::new()
        .route("/hook", post(handle_hook))
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind {addr}: {e}"))?;

    println!("[server] Listening on http://{addr}/hook");

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("[server] Server error: {e}");
        }
    });

    Ok(())
}

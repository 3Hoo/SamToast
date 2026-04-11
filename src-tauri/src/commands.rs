// FunnyToastAlarm — Tauri command stubs
//
// These commands are called by the notification window frontend.
// Full implementations will be added in Phase 5a / Phase 6.

/// Called when the user clicks the notification toast.
/// Will focus the associated Claude Code session in Phase 6.
#[tauri::command]
pub fn on_notification_click() {
    // TODO (Phase 6): focus the Claude Code terminal session associated with
    // the notification window that emitted this event.
}

/// Called by the frontend after it has finished its closing animation.
/// Will perform any necessary cleanup in Phase 5a.
#[tauri::command]
pub fn on_notification_closing() {
    // TODO (Phase 5a): hide/destroy the notification window and update session
    // state after the frontend closing animation completes.
}

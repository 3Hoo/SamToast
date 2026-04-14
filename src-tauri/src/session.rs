// SamToast - Session registry for tracking Claude Code sessions

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio_util::sync::CancellationToken;

pub type SharedSessions = Arc<Mutex<SessionRegistry>>;

/// Notification visibility status
#[derive(Debug, Clone, PartialEq)]
pub enum NotificationStatus {
    /// Notification is hidden or waiting
    Idle,
    /// Notification is currently displayed
    Active,
    /// Notification is in closing animation
    Closing,
}

/// State information for a single Claude Code session
#[derive(Debug, Clone)]
pub struct SessionState {
    /// Unique session identifier from Claude Code hook payload
    pub session_id: String,
    /// Tauri window label for this session's notification, e.g. "notification-abc123"
    pub window_label: String,
    /// Current working directory of the Claude Code session
    pub cwd: Option<String>,
    /// Process ID of Claude Code
    pub pid: Option<u32>,
    /// Current notification visibility status
    pub status: NotificationStatus,
    /// Cancellation token for the active timeout task
    pub cancel_token: Option<CancellationToken>,
}

impl SessionState {
    /// Create a new SessionState with default status (Idle)
    pub fn new(session_id: String, window_label: String) -> Self {
        Self {
            session_id,
            window_label,
            cwd: None,
            pid: None,
            status: NotificationStatus::Idle,
            cancel_token: None,
        }
    }

    /// Create a new SessionState with full context
    pub fn with_context(
        session_id: String,
        window_label: String,
        cwd: Option<String>,
        pid: Option<u32>,
    ) -> Self {
        Self {
            session_id,
            window_label,
            cwd,
            pid,
            status: NotificationStatus::Idle,
            cancel_token: None,
        }
    }
}

/// Registry for managing all active Claude Code sessions
pub struct SessionRegistry {
    sessions: HashMap<String, SessionState>,
}

impl SessionRegistry {
    /// Create a new empty session registry
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    /// Retrieve a session by session_id (immutable)
    pub fn get(&self, session_id: &str) -> Option<SessionState> {
        self.sessions.get(session_id).cloned()
    }

    /// Retrieve a mutable reference to a session by session_id
    pub fn get_mut(&mut self, session_id: &str) -> Option<&mut SessionState> {
        self.sessions.get_mut(session_id)
    }

    /// Insert or update a session
    pub fn upsert(&mut self, session_id: String, state: SessionState) {
        self.sessions.insert(session_id, state);
    }

    /// Remove a session by session_id
    pub fn remove(&mut self, session_id: &str) -> Option<SessionState> {
        self.sessions.remove(session_id)
    }

    /// Get a list of all active session IDs
    pub fn session_ids(&self) -> Vec<String> {
        self.sessions.keys().cloned().collect()
    }

    /// Get the total number of active sessions
    pub fn len(&self) -> usize {
        self.sessions.len()
    }

    /// Check if the registry is empty
    pub fn is_empty(&self) -> bool {
        self.sessions.is_empty()
    }
}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_state_creation() {
        let state = SessionState::new(
            "session-123".to_string(),
            "notification-session-123".to_string(),
        );
        assert_eq!(state.session_id, "session-123");
        assert_eq!(state.window_label, "notification-session-123");
        assert_eq!(state.status, NotificationStatus::Idle);
        assert_eq!(state.cwd, None);
        assert_eq!(state.pid, None);
    }

    #[test]
    fn test_session_state_with_context() {
        let state = SessionState::with_context(
            "session-456".to_string(),
            "notification-session-456".to_string(),
            Some("/home/user/project".to_string()),
            Some(1234),
        );
        assert_eq!(state.session_id, "session-456");
        assert_eq!(state.cwd, Some("/home/user/project".to_string()));
        assert_eq!(state.pid, Some(1234));
    }

    #[test]
    fn test_registry_operations() {
        let mut registry = SessionRegistry::new();

        // Test empty registry
        assert!(registry.is_empty());
        assert_eq!(registry.len(), 0);

        // Test upsert
        let state1 = SessionState::new("s1".to_string(), "notif-s1".to_string());
        registry.upsert("s1".to_string(), state1.clone());
        assert_eq!(registry.len(), 1);

        // Test get
        let retrieved = registry.get("s1");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().session_id, "s1");

        // Test get_mut
        if let Some(session) = registry.get_mut("s1") {
            session.status = NotificationStatus::Active;
        }
        assert_eq!(registry.get("s1").unwrap().status, NotificationStatus::Active);

        // Test session_ids
        let state2 = SessionState::new("s2".to_string(), "notif-s2".to_string());
        registry.upsert("s2".to_string(), state2);
        let ids = registry.session_ids();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"s1".to_string()));
        assert!(ids.contains(&"s2".to_string()));

        // Test remove
        let removed = registry.remove("s1");
        assert!(removed.is_some());
        assert_eq!(registry.len(), 1);
        assert!(registry.get("s1").is_none());
    }
}

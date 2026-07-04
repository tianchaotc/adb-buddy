//! Registry of long-running `tokio::process::Child` handles.
//!
//! Used by `start_logcat` (and reserved for `screenrecord` / future
//! streaming commands). The frontend holds the `session_id` string and
//! calls `stop_logcat(session_id)` to kill the process.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::process::Child;
use tokio::sync::Mutex;

use crate::error::AdbError;

/// One handle + a flag indicating whether the registry owns the kill.
pub struct ChildHandle {
    pub child: Child,
}

/// Process registry.
///
/// Wrapped in `tokio::sync::Mutex` and held in Tauri state as
/// `tauri::State<ProcessRegistry>` (the inner type is already a Mutex, so
/// Tauri can hold it directly).
#[derive(Default)]
pub struct ProcessRegistry {
    inner: Arc<Mutex<HashMap<String, Child>>>,
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a child under `session_id`. If a previous child exists with
    /// the same id, it is dropped (and therefore killed, since `Child` sets
    /// `kill_on_drop`).
    pub async fn register(&self, session_id: String, child: Child) {
        let mut map = self.inner.lock().await;
        if let Some(prev) = map.insert(session_id.clone(), child) {
            // Drop the previous handle; kill_on_drop reaps it.
            drop(prev);
        }
    }

    /// Kill the child registered under `session_id`, if any.
    pub async fn kill(&self, session_id: &str) -> Result<(), AdbError> {
        let mut map = self.inner.lock().await;
        match map.remove(session_id) {
            Some(mut child) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                Ok(())
            }
            None => Ok(()),
        }
    }

    /// Return the list of currently-registered session ids.
    pub async fn list(&self) -> Vec<String> {
        let map = self.inner.lock().await;
        map.keys().cloned().collect()
    }

    /// Take the child out of the registry without killing it (used when the
    /// streaming task itself completes naturally).
    pub async fn take(&self, session_id: &str) -> Option<Child> {
        let mut map = self.inner.lock().await;
        map.remove(session_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::process::Command;

    #[tokio::test]
    async fn register_and_kill() {
        let registry = ProcessRegistry::new();
        // Spawn a long-running process (`sleep 30`) and register it.
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.args(["/C", "ping -n 30 127.0.0.1 > NUL"]);
            c
        } else {
            let mut c = Command::new("sleep");
            c.arg("30");
            c
        };
        cmd.kill_on_drop(true);
        let child = cmd.spawn().expect("spawn");
        registry.register("session-1".into(), child).await;
        assert_eq!(registry.list().await, vec!["session-1".to_string()]);
        registry.kill("session-1").await.expect("kill");
        assert!(registry.list().await.is_empty());
    }

    #[tokio::test]
    async fn kill_missing_session_is_noop() {
        let registry = ProcessRegistry::new();
        registry.kill("nope").await.expect("no error");
    }
}

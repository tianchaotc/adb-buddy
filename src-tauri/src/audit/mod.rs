//! Audit log — wraps `history::store::insert` so commands can record their
//! invocation with a single call.
//!
//! We deliberately do not return errors back to the caller: if the audit log
//! fails, the original command result should still reach the user. Errors are
//! logged via `log::warn!` instead.

use std::sync::Arc;

use chrono::Utc;

use crate::adb::models::HistoryEntry;
use crate::history::HistoryStore;

/// Record a single command in the audit log.
///
/// `module` is the feature module label (e.g. `"devices"`, `"install"`).
/// `stdout` / `stderr` are the captured outputs. If `store` is `None`, the
/// call is a no-op (used in unit tests).
pub async fn log(
    store: Option<&Arc<HistoryStore>>,
    command: &str,
    exit_code: Option<i32>,
    duration_ms: u64,
    serial: Option<&str>,
    module: &str,
    stdout: &str,
    stderr: &str,
) {
    let Some(store) = store else {
        return;
    };
    let entry = HistoryEntry {
        id: None,
        timestamp: Utc::now().to_rfc3339(),
        device_serial: serial.unwrap_or("").to_string(),
        feature_module: module.to_string(),
        command: command.to_string(),
        exit_code,
        duration_ms,
        stdout: stdout.to_string(),
        stderr: stderr.to_string(),
    };
    if let Err(e) = store.insert(entry).await {
        log::warn!("audit log insert failed: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn audit_log_inserts_when_store_present() {
        let store = HistoryStore::in_memory().expect("open");
        log(
            Some(&store),
            "adb devices -l",
            Some(0),
            42,
            Some("HA0XYY05"),
            "devices",
            "List of devices attached",
            "",
        )
        .await;
        let results = store
            .query(&crate::adb::models::HistoryFilter::default())
            .await
            .expect("query");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].command, "adb devices -l");
    }

    #[tokio::test]
    async fn audit_log_no_op_when_store_none() {
        // Just exercise the None path; should not panic.
        log(None, "adb", Some(0), 1, None, "test", "", "").await;
    }
}

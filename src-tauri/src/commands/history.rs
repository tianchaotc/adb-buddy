//! Command history query / re-run / clear / export.

use std::sync::Arc;

use tauri::State;

use crate::adb::models::{ExportFormat, HistoryEntry, HistoryFilter};
use crate::commands::history_ref;
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::settings::AppSettings;

/// `query_history(filter) -> Vec<HistoryEntry>`
#[tauri::command]
pub async fn query_history(
    filter: HistoryFilter,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<Vec<HistoryEntry>, AdbError> {
    let store = history_ref(&history);
    store.query(&filter).await
}

/// `rerun_history(entry_id) -> HistoryEntry` — fetch the entry by id.
///
/// (Actually re-executing the command would require a device context; for
/// MVP we just return the stored entry so the frontend can re-issue it.)
#[tauri::command]
pub async fn rerun_history(
    entry_id: i64,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<HistoryEntry, AdbError> {
    let store = history_ref(&history);
    store
        .get(entry_id)
        .await?
        .ok_or_else(|| AdbError::InvalidInput {
            field: "entry_id".into(),
            reason: format!("no history entry with id {}", entry_id),
        })
}

/// `clear_history(before: Option<String>) -> usize`
#[tauri::command]
pub async fn clear_history(
    before: Option<String>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<usize, AdbError> {
    let store = history_ref(&history);
    let before_ref = before.as_deref();
    store.clear(before_ref).await
}

/// `export_history(filter, format) -> String`
#[tauri::command]
pub async fn export_history(
    filter: HistoryFilter,
    format: ExportFormat,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<String, AdbError> {
    let store = history_ref(&history);
    let entries = store.query(&filter).await?;
    match format {
        ExportFormat::Json => {
            serde_json::to_string_pretty(&entries).map_err(|e| AdbError::HistoryDbError {
                message: format!("json export failed: {}", e),
            })
        }
    }
}

// Silence unused-import warning when AppSettings isn't directly referenced.
#[allow(dead_code)]
fn _use_settings(_: &State<'_, std::sync::Mutex<AppSettings>>) {}

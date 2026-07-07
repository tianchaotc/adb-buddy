//! Tauri command handlers — the IPC surface between Rust and the React
//! frontend.
//!
//! Every `#[tauri::command]` here is registered in `crate::lib::run` via
//! `tauri::generate_handler!`.

pub mod devices;
pub mod history;
pub mod install;
pub mod logs;
pub mod packages;
pub mod screenshot;
pub mod settings;
pub mod shell;

use std::sync::Arc;

use tauri::State;

use crate::adb::path;
use crate::adb::runner::AdbRunner;
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::settings::AppSettings;

/// Helper: build an `AdbRunner` from managed settings state.
///
/// The std Mutex guard is held only while cloning the `adb_path` field, then
/// dropped — so subsequent `.await` calls don't deadlock.
pub fn runner_from_settings(settings: &State<'_, std::sync::Mutex<AppSettings>>) -> Result<AdbRunner, AdbError> {
    let custom = settings
        .lock()
        .map_err(|e| AdbError::IoError {
            message: format!("settings mutex poisoned: {}", e),
        })?
        .adb_path
        .clone();
    AdbRunner::from_settings(&custom)
}

/// Helper: extract the history store reference from managed state.
pub fn history_ref(history: &State<'_, Arc<HistoryStore>>) -> Arc<HistoryStore> {
    Arc::clone(&history)
}

/// Helper: try to resolve the adb path without spawning commands.
pub fn adb_path_string(custom: &Option<String>) -> Result<String, AdbError> {
    let p = path::resolve_adb(custom)?;
    Ok(p.to_string_lossy().into_owned())
}

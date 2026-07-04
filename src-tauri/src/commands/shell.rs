//! Shell command runner + preset / favorites management.

use std::sync::Arc;

use tauri::State;

use crate::adb::models::CmdResult;
use crate::adb::models::ShellPreset;
use crate::audit;
use crate::commands::{history_ref, runner_from_settings};
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::settings::AppSettings;

/// Run `adb shell <command>` and capture stdout/stderr/exit code.
#[tauri::command]
pub async fn run_shell(
    serial: Option<String>,
    command: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<CmdResult, AdbError> {
    let runner = runner_from_settings(&settings)?;
    let result = runner
        .run(
            vec!["shell".into(), command.clone()],
            serial.clone(),
            None,
        )
        .await?;
    audit::log(
        Some(&history_ref(&history)),
        &result.command,
        Some(result.exit_code),
        result.duration_ms,
        serial.as_deref(),
        "shell",
        &result.stdout,
        &result.stderr,
    )
    .await;
    if result.exit_code != 0 {
        // We still return the result — the user wants to see the failure
        // output, not just an error. The exit_code is in the CmdResult.
    }
    Ok(result)
}

/// Return the hardcoded preset list.
#[tauri::command]
pub async fn list_shell_presets() -> Result<Vec<ShellPreset>, AdbError> {
    Ok(shell_presets())
}

/// Return the user's saved favorites.
#[tauri::command]
pub async fn get_shell_favorites(
    settings: State<'_, std::sync::Mutex<AppSettings>>,
) -> Result<Vec<String>, AdbError> {
    let favorites = settings
        .lock()
        .map_err(|e| AdbError::IoError {
            message: format!("settings mutex poisoned: {}", e),
        })?
        .shell_favorites
        .clone();
    Ok(favorites)
}

/// Add a favorite (dedup, no-op if already present).
#[tauri::command]
pub async fn add_shell_favorite(
    cmd: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
) -> Result<(), AdbError> {
    let mut s = settings
        .lock()
        .map_err(|e| AdbError::IoError {
            message: format!("settings mutex poisoned: {}", e),
        })?;
    if !s.shell_favorites.iter().any(|f| f == &cmd) {
        s.shell_favorites.push(cmd);
    }
    s.save()?;
    Ok(())
}

/// Remove a favorite by exact match.
#[tauri::command]
pub async fn remove_shell_favorite(
    cmd: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
) -> Result<(), AdbError> {
    let mut s = settings
        .lock()
        .map_err(|e| AdbError::IoError {
            message: format!("settings mutex poisoned: {}", e),
        })?;
    s.shell_favorites.retain(|f| f != &cmd);
    s.save()?;
    Ok(())
}

/// Hardcoded preset list per spec §3.8.
pub(crate) fn shell_presets() -> Vec<ShellPreset> {
    vec![
        ShellPreset {
            label: "Properties".into(),
            command: "getprop".into(),
            description: "Print all system properties".into(),
        },
        ShellPreset {
            label: "Activity manager".into(),
            command: "dumpsys activity".into(),
            description: "Dump activity manager state".into(),
        },
        ShellPreset {
            label: "Window manager".into(),
            command: "dumpsys window".into(),
            description: "Dump window manager state".into(),
        },
        ShellPreset {
            label: "Package info".into(),
            command: "dumpsys package".into(),
            description: "Dump package manager state".into(),
        },
        ShellPreset {
            label: "Battery".into(),
            command: "dumpsys battery".into(),
            description: "Dump battery state".into(),
        },
        ShellPreset {
            label: "Device idle".into(),
            command: "dumpsys deviceidle".into(),
            description: "Dump Doze / idle state".into(),
        },
        ShellPreset {
            label: "Global settings".into(),
            command: "settings list global".into(),
            description: "List global settings".into(),
        },
        ShellPreset {
            label: "Secure settings".into(),
            command: "settings list secure".into(),
            description: "List secure settings".into(),
        },
        ShellPreset {
            label: "System settings".into(),
            command: "settings list system".into(),
            description: "List system settings".into(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_match_spec() {
        let presets = shell_presets();
        let labels: Vec<_> = presets.iter().map(|p| p.label.as_str()).collect();
        assert!(labels.contains(&"Properties"));
        assert!(labels.contains(&"Activity manager"));
        assert!(labels.contains(&"Window manager"));
        assert!(labels.contains(&"Package info"));
        assert!(labels.contains(&"Battery"));
        assert!(labels.contains(&"Device idle"));
        assert!(labels.contains(&"Global settings"));
        assert!(labels.contains(&"Secure settings"));
        assert!(labels.contains(&"System settings"));
    }

    #[test]
    fn presets_have_nonempty_commands() {
        for p in shell_presets() {
            assert!(!p.command.is_empty());
            assert!(!p.description.is_empty());
        }
    }
}

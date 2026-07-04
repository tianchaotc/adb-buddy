//! ADB settings commands.

use std::sync::Arc;
use std::time::Duration;

use tauri::State;

use crate::adb::models::{AdbConfig, AdbVersionInfo};
use crate::audit;
use crate::commands::history_ref;
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::settings::AppSettings;

/// Return the current adb path + version info (if resolvable).
#[tauri::command]
pub async fn get_adb_config(
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<AdbConfig, AdbError> {
    let (custom_path, custom) = {
        let s = settings
            .lock()
            .map_err(|e| AdbError::IoError {
                message: format!("settings mutex poisoned: {}", e),
            })?;
        (s.adb_path.clone(), s.adb_path.is_some())
    };

    let path = match crate::adb::path::resolve_adb(&custom_path) {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(_) => String::new(),
    };

    let version_info = if path.is_empty() {
        None
    } else {
        // Run `adb version` best-effort.
        run_version_check(&path, &history).await.ok()
    };

    Ok(AdbConfig {
        path,
        version_info,
        custom,
    })
}

/// Set the custom adb path. Pass `None` to reset to auto.
#[tauri::command]
pub async fn set_adb_path(
    path: Option<String>,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<AdbConfig, AdbError> {
    {
        let mut s = settings
            .lock()
            .map_err(|e| AdbError::IoError {
                message: format!("settings mutex poisoned: {}", e),
            })?;
        s.adb_path = path;
        s.save()?;
    }
    // Re-resolve and return the config. Use the real history store so the
    // version-check audit record lands in the persistent DB, not a throwaway
    // in-memory copy.
    get_adb_config_internal(&settings, &history).await
}

/// Run `adb version` and parse the output into [`AdbVersionInfo`].
#[tauri::command]
pub async fn validate_adb(
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<AdbVersionInfo, AdbError> {
    let custom = {
        let s = settings
            .lock()
            .map_err(|e| AdbError::IoError {
                message: format!("settings mutex poisoned: {}", e),
            })?;
        s.adb_path.clone()
    };
    let path = crate::adb::path::resolve_adb(&custom)?;

    // Spawn `adb version`.
    let mut command = tokio::process::Command::new(&path);
    command.arg("version");
    command.kill_on_drop(true);
    let start = std::time::Instant::now();
    let output = tokio::time::timeout(Duration::from_secs(10), command.output())
        .await
        .map_err(|_| AdbError::CommandTimeout {
            cmd: "adb version".into(),
            timeout_ms: 10_000,
        })?
        .map_err(AdbError::io)?;
    let duration_ms = start.elapsed().as_millis() as u64;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let exit_code = output.status.code().unwrap_or(-1);

    audit::log(
        Some(&history_ref(&history)),
        "adb version",
        Some(exit_code),
        duration_ms,
        None,
        "settings",
        &stdout,
        &stderr,
    )
    .await;

    if exit_code != 0 {
        return Err(AdbError::AdbVersionCheckFailed { stderr });
    }

    Ok(parse_version(&stdout, &path.to_string_lossy()))
}

async fn get_adb_config_internal(
    settings: &State<'_, std::sync::Mutex<AppSettings>>,
    history: &Arc<HistoryStore>,
) -> Result<AdbConfig, AdbError> {
    let custom_path = {
        let s = settings
            .lock()
            .map_err(|e| AdbError::IoError {
                message: format!("settings mutex poisoned: {}", e),
            })?;
        s.adb_path.clone()
    };
    let custom = custom_path.is_some();

    let path = match crate::adb::path::resolve_adb(&custom_path) {
        Ok(p) => p.to_string_lossy().into_owned(),
        Err(_) => String::new(),
    };

    let version_info = if path.is_empty() {
        None
    } else {
        run_version_check(&path, history).await.ok()
    };

    Ok(AdbConfig {
        path,
        version_info,
        custom,
    })
}

async fn run_version_check(
    path: &str,
    history: &Arc<HistoryStore>,
) -> Result<AdbVersionInfo, AdbError> {
    let mut command = tokio::process::Command::new(path);
    command.arg("version");
    command.kill_on_drop(true);
    let start = std::time::Instant::now();
    let output = tokio::time::timeout(Duration::from_secs(10), command.output())
        .await
        .map_err(|_| AdbError::CommandTimeout {
            cmd: "adb version".into(),
            timeout_ms: 10_000,
        })?
        .map_err(AdbError::io)?;
    let duration_ms = start.elapsed().as_millis() as u64;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let exit_code = output.status.code().unwrap_or(-1);

    audit::log(
        Some(history),
        "adb version",
        Some(exit_code),
        duration_ms,
        None,
        "settings",
        &stdout,
        &stderr,
    )
    .await;

    if exit_code != 0 {
        return Err(AdbError::AdbVersionCheckFailed { stderr });
    }

    Ok(parse_version(&stdout, path))
}

/// Parse `adb version` output.
///
/// Sample:
/// ```text
/// Android Debug Bridge version 1.0.41
/// Version 34.0.5-10900861
/// Installed as /usr/local/bin/adb
/// ```
fn parse_version(stdout: &str, path: &str) -> AdbVersionInfo {
    let mut version = String::new();
    let mut version_string = String::new();
    for line in stdout.lines() {
        let line = line.trim();
        if version.is_empty() && line.starts_with("Android Debug Bridge version ") {
            version = line
                .strip_prefix("Android Debug Bridge version ")
                .unwrap_or("")
                .to_string();
            version_string = line.to_string();
        } else if version_string.is_empty() && line.starts_with("Version ") {
            version_string = line.to_string();
        }
    }
    if version_string.is_empty() {
        version_string = stdout.trim().to_string();
    }
    AdbVersionInfo {
        version,
        version_string,
        path: path.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_basic() {
        let raw = "Android Debug Bridge version 1.0.41\nVersion 34.0.5-10900861\nInstalled as /usr/local/bin/adb\n";
        let info = parse_version(raw, "/usr/local/bin/adb");
        assert_eq!(info.version, "1.0.41");
        assert_eq!(info.path, "/usr/local/bin/adb");
        assert!(info.version_string.contains("1.0.41"));
    }

    #[test]
    fn parse_version_fallback_to_full_stdout() {
        let raw = "weird adb output\n";
        let info = parse_version(raw, "/x/adb");
        assert!(info.version.is_empty());
        assert_eq!(info.version_string, raw.trim());
    }
}

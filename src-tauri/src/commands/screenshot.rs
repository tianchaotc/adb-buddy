//! Screenshot capture.
//!
//! `adb shell screencap -p /sdcard/adb-buddy-screenshot.png` then `adb pull`.

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;

use tauri::State;

use crate::adb::models::ScreenshotResult;
use crate::audit;
use crate::commands::{history_ref, runner_from_settings};
use crate::commands::packages::default_download_dir;
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::settings::AppSettings;

/// Capture a screenshot, pull it locally, return the local path + timestamp.
#[tauri::command]
pub async fn take_screenshot(
    serial: Option<String>,
    dest_dir: Option<String>,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<ScreenshotResult, AdbError> {
    let runner = runner_from_settings(&settings)?;
    let timestamp = Utc::now();
    let remote_path = format!(
        "/sdcard/adb-buddy-screenshot-{}.png",
        timestamp.format("%Y%m%dT%H%M%S")
    );

    // 1. screencap on the device.
    let cap_result = runner
        .run(
            vec![
                "shell".into(),
                "screencap".into(),
                "-p".into(),
                remote_path.clone(),
            ],
            serial.clone(),
            Some(Duration::from_secs(15)),
        )
        .await?;
    audit::log(
        Some(&history_ref(&history)),
        &cap_result.command,
        Some(cap_result.exit_code),
        cap_result.duration_ms,
        serial.as_deref(),
        "screenshot",
        &cap_result.stdout,
        &cap_result.stderr,
    )
    .await;
    if cap_result.exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: cap_result.command,
            exit_code: cap_result.exit_code,
            stderr: cap_result.stderr,
        });
    }

    // 2. adb pull to dest_dir.
    let dest = dest_dir.unwrap_or_else(default_download_dir);
    std::fs::create_dir_all(&dest)?;
    let local_name = format!(
        "adb-buddy-screenshot-{}.png",
        timestamp.format("%Y%m%dT%H%M%S")
    );
    let local_path = std::path::PathBuf::from(&dest)
        .join(&local_name)
        .to_string_lossy()
        .into_owned();
    let pull_result = runner
        .run(
            vec![
                "pull".into(),
                remote_path.clone(),
                local_path.clone(),
            ],
            serial.clone(),
            Some(Duration::from_secs(30)),
        )
        .await?;
    audit::log(
        Some(&history_ref(&history)),
        &pull_result.command,
        Some(pull_result.exit_code),
        pull_result.duration_ms,
        serial.as_deref(),
        "screenshot",
        &pull_result.stdout,
        &pull_result.stderr,
    )
    .await;
    if pull_result.exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: pull_result.command,
            exit_code: pull_result.exit_code,
            stderr: pull_result.stderr,
        });
    }

    // 3. Best-effort cleanup of the remote file.
    let _ = runner
        .run(
            vec!["shell".into(), "rm".into(), "-f".into(), remote_path.clone()],
            serial.clone(),
            Some(Duration::from_secs(5)),
        )
        .await;

    Ok(ScreenshotResult {
        local_path,
        remote_path,
        timestamp: timestamp.to_rfc3339(),
    })
}

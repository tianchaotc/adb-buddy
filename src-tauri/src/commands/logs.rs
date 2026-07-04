//! Logcat commands.
//!
//! - `start_logcat` spawns `adb logcat`, registers the child in
//!   `ProcessRegistry`, and emits `logcat://line` events per stdout line.
//! - `stop_logcat` kills the child by `session_id`.
//! - `clear_logcat_buffer` runs `adb logcat -c`.

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::adb::models::LogcatFilters;
use crate::audit;
use crate::commands::{history_ref, runner_from_settings};
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::process::ProcessRegistry;
use crate::settings::AppSettings;

/// Payload emitted on the `logcat://line` channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogcatLineEvent {
    pub session_id: String,
    pub line: String,
}

/// Payload emitted on the `process://exited` channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessExitedEvent {
    pub session_id: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
}

/// Spawn `adb logcat` and stream lines to the frontend.
///
/// Returns the `session_id` immediately so the caller can call `stop_logcat`.
#[tauri::command]
pub async fn start_logcat(
    serial: Option<String>,
    filters: LogcatFilters,
    app: AppHandle,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
    processes: State<'_, ProcessRegistry>,
) -> Result<String, AdbError> {
    let runner = runner_from_settings(&settings)?;

    // Build args.
    let mut args = vec!["logcat".into()];
    if let Some(spec) = &filters.filter_spec {
        if !spec.is_empty() {
            args.push(spec.clone());
        }
    }

    let session_id = Uuid::new_v4().to_string();
    let mut child = runner.spawn(args, serial.clone()).await?;
    let session_for_callback = session_id.clone();
    let app_for_callback = app.clone();

    // Take stdout BEFORE registering the child so the ProcessRegistry keeps
    // the child handle. When `stop_logcat` kills the child, the stdout pipe
    // closes and the streaming task below exits naturally.
    let stdout = child.stdout.take();

    processes.register(session_id.clone(), child).await;

    // Spawn a streaming task that reads lines from stdout and emits events.
    // When the stream ends (process killed or exited), emit `process://exited`
    // so the frontend can update its running state.
    if let Some(stdout) = stdout {
        let session_id_for_task = session_for_callback.clone();
        let app_handle = app_for_callback.clone();
        tokio::spawn(async move {
            use tokio::io::{AsyncBufReadExt, BufReader};
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_handle.emit(
                    "logcat://line",
                    LogcatLineEvent {
                        session_id: session_id_for_task.clone(),
                        line,
                    },
                );
            }
            // stdout closed → process ended (killed by stop_logcat or exited
            // on its own). Notify the frontend.
            let _ = app_handle.emit(
                "process://exited",
                ProcessExitedEvent {
                    session_id: session_id_for_task,
                    exit_code: None,
                    duration_ms: 0,
                },
            );
        });
    }

    audit::log(
        Some(&history_ref(&history)),
        "adb logcat (started)",
        None,
        0,
        serial.as_deref(),
        "logs",
        "",
        "",
    )
    .await;
    Ok(session_id)
}

/// Stop a logcat session by id.
#[tauri::command]
pub async fn stop_logcat(
    session_id: String,
    app: AppHandle,
    processes: State<'_, ProcessRegistry>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    let _ = processes.kill(&session_id).await;
    let _ = app.emit(
        "process://exited",
        ProcessExitedEvent {
            session_id: session_id.clone(),
            exit_code: None,
            duration_ms: 0,
        },
    );
    audit::log(
        Some(&history_ref(&history)),
        "adb logcat (stopped)",
        None,
        0,
        None,
        "logs",
        "",
        "",
    )
    .await;
    Ok(())
}

/// `adb logcat -c`
#[tauri::command]
pub async fn clear_logcat_buffer(
    serial: Option<String>,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    let runner = runner_from_settings(&settings)?;
    let result = runner
        .run(
            vec!["logcat".into(), "-c".into()],
            serial.clone(),
            Some(Duration::from_secs(10)),
        )
        .await?;
    audit::log(
        Some(&history_ref(&history)),
        &result.command,
        Some(result.exit_code),
        result.duration_ms,
        serial.as_deref(),
        "logs",
        &result.stdout,
        &result.stderr,
    )
    .await;
    if result.exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: result.command,
            exit_code: result.exit_code,
            stderr: result.stderr,
        });
    }
    Ok(())
}

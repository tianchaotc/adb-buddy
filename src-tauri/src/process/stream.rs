//! Line-buffered reader for `tokio::process::Child` stdout/stderr.
//!
//! Used by `start_logcat` to forward each line to the frontend via a Tauri
//! event.

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;

use crate::error::AdbError;

/// Spawn a task that reads lines from `child`'s stdout and invokes `on_line`
/// for each line. Returns immediately.
pub fn spawn_line_reader<F>(child: Child, on_line: F) -> tokio::task::JoinHandle<()>
where
    F: FnMut(String) + Send + 'static,
{
    // We need a Send-safe wrapper because the JoinHandle returns a Send future.
    spawn_line_reader_inner(child, on_line)
}

fn spawn_line_reader_inner<F>(mut child: Child, mut on_line: F) -> tokio::task::JoinHandle<()>
where
    F: FnMut(String) + Send + 'static,
{
    let stdout = child.stdout.take();
    tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                on_line(line);
            }
        }
        // Best-effort wait for the child to exit.
        let _ = child.wait().await;
    })
}

/// Read all lines from a child synchronously (for testing).
pub async fn read_lines_to_vec(child: &mut Child) -> Result<Vec<String>, AdbError> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AdbError::IoError {
            message: "no stdout".into(),
        })?;
    let mut reader = BufReader::new(stdout).lines();
    let mut lines = Vec::new();
    while let Ok(Some(line)) = reader.next_line().await {
        lines.push(line);
    }
    Ok(lines)
}

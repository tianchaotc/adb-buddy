//! Spawns `adb` subprocesses.
//!
//! Two flavors:
//! - [`AdbRunner::run`] — runs to completion, returns [`CmdResult`].
//! - [`AdbRunner::run_streaming`] — spawns and reads lines, used by logcat.

use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::adb::models::CmdResult;
use crate::adb::path;
use crate::error::AdbError;

/// Spawns adb subprocesses.
///
/// Holds nothing but the resolved adb path; immutable and cheap to clone.
#[derive(Debug, Clone)]
pub struct AdbRunner {
    adb_path: PathBuf,
}

impl AdbRunner {
    /// Construct from a resolved adb path.
    pub fn new(adb_path: PathBuf) -> Self {
        AdbRunner { adb_path }
    }

    /// Resolve from settings (`custom` overrides auto-detection).
    pub fn from_settings(custom: &Option<String>) -> Result<Self, AdbError> {
        let adb_path = path::resolve_adb(custom)?;
        Ok(AdbRunner::new(adb_path))
    }

    /// The resolved path to the `adb` binary.
    pub fn adb_path(&self) -> &PathBuf {
        &self.adb_path
    }

    /// Build the argument vector for an adb invocation.
    ///
    /// The first element is the binary path; if `serial` is `Some`, `-s
    /// <serial>` is inserted right after the binary.
    fn build_args(&self, args: &[String], serial: Option<&str>) -> Vec<String> {
        let mut full = Vec::with_capacity(args.len() + 3);
        full.push(self.adb_path.to_string_lossy().into_owned());
        if let Some(s) = serial {
            full.push("-s".into());
            full.push(s.to_string());
        }
        full.extend_from_slice(args);
        full
    }

    /// Run `adb [-s serial] <args...>` to completion.
    ///
    /// `timeout` defaults to 30 seconds when `None`.
    pub async fn run(
        &self,
        args: Vec<String>,
        serial: Option<String>,
        timeout: Option<Duration>,
    ) -> Result<CmdResult, AdbError> {
        let full_args = self.build_args(&args, serial.as_deref());
        let cmd_str = full_args.join(" ");
        let timeout_duration = timeout.unwrap_or_else(|| Duration::from_secs(30));

        let mut command = Command::new(&self.adb_path);
        if let Some(s) = &serial {
            command.arg("-s").arg(s);
        }
        for a in &args {
            command.arg(a);
        }
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());
        command.kill_on_drop(true);

        let start = Instant::now();
        let child = command.spawn().map_err(AdbError::io)?;
        let result = tokio::time::timeout(timeout_duration, child.wait_with_output()).await;

        let duration_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
                let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
                let exit_code = output.status.code().unwrap_or(-1);
                Ok(CmdResult {
                    command: cmd_str,
                    stdout,
                    stderr,
                    exit_code,
                    duration_ms,
                })
            }
            Ok(Err(e)) => Err(AdbError::io(e)),
            Err(_) => {
                // timed out; the `kill_on_drop` flag will reap the child.
                Err(AdbError::CommandTimeout {
                    cmd: cmd_str,
                    timeout_ms: timeout_duration.as_millis() as u64,
                })
            }
        }
    }

    /// Spawn `adb [-s serial] <args...>` and stream stdout line-by-line.
    ///
    /// Returns the spawned child handle. The caller is responsible for
    /// reading lines from its stdout (typically via [`crate::process::stream`])
    /// and for killing it when done.
    pub async fn spawn(
        &self,
        args: Vec<String>,
        serial: Option<String>,
    ) -> Result<tokio::process::Child, AdbError> {
        let mut command = Command::new(&self.adb_path);
        if let Some(s) = &serial {
            command.arg("-s").arg(s);
        }
        for a in &args {
            command.arg(a);
        }
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());
        command.kill_on_drop(true);
        let child = command.spawn().map_err(AdbError::io)?;
        Ok(child)
    }

    /// Spawn a long-running adb process and stream each stdout line to the
    /// supplied callback. Returns the PID of the spawned process.
    pub async fn run_streaming<F>(
        &self,
        args: Vec<String>,
        serial: Option<String>,
        mut on_line: F,
    ) -> Result<u32, AdbError>
    where
        F: FnMut(String),
    {
        let mut child = self.spawn(args, serial).await?;
        let pid = child.id();
        let stdout = child.stdout.take();
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                on_line(line);
            }
        }
        // Best-effort wait; ignore errors.
        let _ = child.wait().await;
        Ok(pid.unwrap_or(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_args_inserts_serial() {
        let runner = AdbRunner::new(PathBuf::from("/usr/bin/adb"));
        let args = vec!["devices".to_string(), "-l".to_string()];
        let full = runner.build_args(&args, Some("HA0XYY05"));
        assert_eq!(
            full,
            vec![
                "/usr/bin/adb".to_string(),
                "-s".to_string(),
                "HA0XYY05".to_string(),
                "devices".to_string(),
                "-l".to_string(),
            ]
        );
    }

    #[test]
    fn build_args_omits_serial_when_none() {
        let runner = AdbRunner::new(PathBuf::from("/usr/bin/adb"));
        let args = vec!["devices".to_string()];
        let full = runner.build_args(&args, None);
        assert_eq!(full, vec!["/usr/bin/adb".to_string(), "devices".to_string()]);
    }
}

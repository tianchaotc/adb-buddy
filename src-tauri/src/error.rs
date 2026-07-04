//! ADB error model.
//!
//! See spec §2.4. Serialized to the frontend with `#[serde(tag = "kind",
//! content = "detail")]` so TypeScript can pattern-match on `kind`.

use serde::Serialize;

/// The single error type returned by all Tauri commands.
///
/// Every variant maps to a user-visible failure mode with a clear cause and
/// suggested fix documented in the frontend `lib/errors.ts`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "detail")]
pub enum AdbError {
    /// `adb` (or `fastboot`) binary not found on PATH and no custom path set.
    AdbNotFound { searched_paths: Vec<String> },
    /// `adb version` exited non-zero or produced unusable output.
    AdbVersionCheckFailed { stderr: String },
    /// No devices attached.
    NoDevices,
    /// Multiple devices attached and no serial selected.
    MultipleDevices { serials: Vec<String> },
    /// Selected device is in `offline` state.
    DeviceOffline { serial: String },
    /// Selected device is in `unauthorized` state (RSA prompt not accepted).
    DeviceUnauthorized { serial: String },
    /// ADB command exited with a non-zero status code.
    CommandFailed {
        cmd: String,
        exit_code: i32,
        stderr: String,
    },
    /// ADB command did not finish within the timeout.
    CommandTimeout { cmd: String, timeout_ms: u64 },
    /// Output could not be parsed.
    ParseFailed {
        cmd: String,
        raw: String,
        reason: String,
    },
    /// Wraps an underlying `std::io::Error`.
    IoError { message: String },
    /// `adb install` returned a known `INSTALL_FAILED_*` / `INSTALL_PARSE_FAILED_*` code.
    InstallFailed { code: String, explanation: String },
    /// Caller-supplied input was invalid.
    InvalidInput { field: String, reason: String },
    /// A long-running process is already registered under this session id.
    ProcessAlreadyRunning { session_id: String },
    /// SQLite history database error.
    HistoryDbError { message: String },
}

impl AdbError {
    /// Convenience constructor for `IoError` that stringifies the underlying error.
    pub fn io(err: std::io::Error) -> Self {
        AdbError::IoError {
            message: err.to_string(),
        }
    }
}

impl From<rusqlite::Error> for AdbError {
    fn from(err: rusqlite::Error) -> Self {
        AdbError::HistoryDbError {
            message: err.to_string(),
        }
    }
}

impl From<std::io::Error> for AdbError {
    fn from(err: std::io::Error) -> Self {
        AdbError::IoError {
            message: err.to_string(),
        }
    }
}

impl From<serde_json::Error> for AdbError {
    fn from(err: serde_json::Error) -> Self {
        AdbError::HistoryDbError {
            message: format!("json: {}", err),
        }
    }
}

impl std::fmt::Display for AdbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AdbError::AdbNotFound { searched_paths } => {
                write!(f, "adb not found; searched: {}", searched_paths.join(", "))
            }
            AdbError::AdbVersionCheckFailed { stderr } => {
                write!(f, "adb version check failed: {}", stderr)
            }
            AdbError::NoDevices => write!(f, "no devices attached"),
            AdbError::MultipleDevices { serials } => {
                write!(f, "multiple devices attached: {}", serials.join(", "))
            }
            AdbError::DeviceOffline { serial } => write!(f, "device {} is offline", serial),
            AdbError::DeviceUnauthorized { serial } => {
                write!(f, "device {} is unauthorized", serial)
            }
            AdbError::CommandFailed {
                cmd,
                exit_code,
                stderr,
            } => {
                write!(
                    f,
                    "command `{}` failed (exit {}): {}",
                    cmd, exit_code, stderr
                )
            }
            AdbError::CommandTimeout { cmd, timeout_ms } => {
                write!(f, "command `{}` timed out after {}ms", cmd, timeout_ms)
            }
            AdbError::ParseFailed { cmd, reason, .. } => {
                write!(f, "failed to parse output of `{}`: {}", cmd, reason)
            }
            AdbError::IoError { message } => write!(f, "io error: {}", message),
            AdbError::InstallFailed { code, explanation } => {
                write!(f, "install failed [{}]: {}", code, explanation)
            }
            AdbError::InvalidInput { field, reason } => {
                write!(f, "invalid input `{}`: {}", field, reason)
            }
            AdbError::ProcessAlreadyRunning { session_id } => {
                write!(f, "process {} already running", session_id)
            }
            AdbError::HistoryDbError { message } => {
                write!(f, "history db error: {}", message)
            }
        }
    }
}

impl std::error::Error for AdbError {}

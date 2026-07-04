//! Data types shared between Rust and the TypeScript frontend.
//!
//! Every public struct here derives `Serialize` so it can be returned from
//! `#[tauri::command]` functions. Enum variants follow the spec's IPC design.

use serde::{Deserialize, Serialize};

/// State of an attached device, as reported by `adb devices`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceState {
    /// Ready and authorized.
    Device,
    /// Visible but not responding.
    Offline,
    /// RSA prompt not yet accepted.
    Unauthorized,
    /// Recovery mode.
    Recovery,
    /// Bootloader mode.
    Bootloader,
    /// Sideload mode.
    Sideload,
    /// Anything we don't recognize.
    Unknown,
}

impl DeviceState {
    /// Parse a single state token from `adb devices` output.
    pub fn parse(s: &str) -> Self {
        match s.trim() {
            "device" => DeviceState::Device,
            "offline" => DeviceState::Offline,
            "unauthorized" => DeviceState::Unauthorized,
            "recovery" => DeviceState::Recovery,
            "bootloader" => DeviceState::Bootloader,
            "sideload" => DeviceState::Sideload,
            _ => DeviceState::Unknown,
        }
    }
}

/// A single attached device, parsed from `adb devices -l`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub serial: String,
    pub state: DeviceState,
    /// USB `transport_id` (when running `adb devices -l`).
    pub transport_id: Option<String>,
    /// `usb:` field, e.g. `1-3`.
    pub usb: Option<String>,
    /// `model:` field, e.g. `Pixel_7`.
    pub model: Option<String>,
    /// `product:` field.
    pub product: Option<String>,
    /// `device:` field (device codename).
    pub device: Option<String>,
}

/// A single installed package, parsed from `pm list packages`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Package {
    pub name: String,
    pub is_system: bool,
    pub is_third_party: bool,
    pub is_disabled: bool,
}

/// Filter applied to `pm list packages`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PackageFilter {
    /// `pm list packages` (no flag).
    All,
    /// `pm list packages -3`.
    ThirdParty,
    /// `pm list packages -s`.
    System,
    /// `pm list packages -d`.
    Disabled,
}

impl Default for PackageFilter {
    fn default() -> Self {
        PackageFilter::All
    }
}

/// Detailed information for a single package, parsed from `dumpsys package`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PackageDetails {
    pub name: String,
    pub version_name: Option<String>,
    pub version_code: Option<i64>,
    pub apk_path: Option<String>,
    pub uid: Option<i64>,
    pub target_sdk: Option<i64>,
    pub min_sdk: Option<i64>,
    pub first_install_time: Option<String>,
    pub last_update_time: Option<String>,
    pub is_system: bool,
    pub is_enabled: bool,
}

/// Battery info, parsed from `dumpsys battery`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BatteryInfo {
    pub level: Option<i32>,
    pub status: Option<i32>,
    pub powered: Option<bool>,
    pub ac_powered: Option<bool>,
    pub usb_powered: Option<bool>,
    pub temperature: Option<i32>,
    pub voltage: Option<i32>,
    pub technology: Option<String>,
}

/// Aggregated device overview, shown on the Dashboard.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DeviceOverview {
    pub serial: String,
    pub model: Option<String>,
    pub brand: Option<String>,
    pub manufacturer: Option<String>,
    pub android_version: Option<String>,
    pub sdk_level: Option<i32>,
    pub build_id: Option<String>,
    pub build_fingerprint: Option<String>,
    pub security_patch: Option<String>,
    pub abi: Option<String>,
    pub screen_resolution: Option<String>,
    pub screen_density: Option<i32>,
    pub battery: Option<BatteryInfo>,
    pub selinux: Option<String>,
    pub root: Option<bool>,
}

/// Flags passed to `adb install`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InstallFlags {
    /// `-r` reinstall, preserving data.
    #[serde(default)]
    pub reinstall: bool,
    /// `-d` allow version downgrade.
    #[serde(default)]
    pub allow_downgrade: bool,
    /// `-g` grant all runtime permissions.
    #[serde(default)]
    pub grant_permissions: bool,
    /// Use `install-multiple` for split APKs.
    #[serde(default)]
    pub multiple: bool,
}

impl InstallFlags {
    /// Build the argument vector for `adb install` / `adb install-multiple`.
    pub fn to_args(&self) -> Vec<String> {
        let mut args = Vec::new();
        if self.reinstall {
            args.push("-r".into());
        }
        if self.allow_downgrade {
            args.push("-d".into());
        }
        if self.grant_permissions {
            args.push("-g".into());
        }
        args
    }
}

/// Outcome of an `adb install` invocation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallResult {
    /// `Success` or `Failure`.
    pub success: bool,
    /// The raw first line of stdout.
    pub message: String,
    /// When `success` is true, "Success"; otherwise the failure code.
    pub code: Option<String>,
}

/// Captured result of a single ADB command, returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CmdResult {
    /// The full command string (for audit / console display).
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
}

/// Result of a screenshot capture.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotResult {
    pub local_path: String,
    pub remote_path: String,
    /// ISO 8601 timestamp of capture.
    pub timestamp: String,
}

/// One entry in the command history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: Option<i64>,
    /// ISO 8601 timestamp.
    pub timestamp: String,
    pub device_serial: String,
    /// e.g. `devices`, `packages`, `install`.
    pub feature_module: String,
    pub command: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub stdout: String,
    pub stderr: String,
}

/// Filter parameters for querying history.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HistoryFilter {
    /// Substring search on `command`.
    #[serde(default)]
    pub search: Option<String>,
    /// Filter by feature module.
    #[serde(default)]
    pub module: Option<String>,
    /// Filter by device serial.
    #[serde(default)]
    pub serial: Option<String>,
    /// ISO 8601 inclusive lower bound.
    #[serde(default)]
    pub since: Option<String>,
    /// ISO 8601 inclusive upper bound.
    #[serde(default)]
    pub until: Option<String>,
    /// Max rows to return (default 100).
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    100
}

/// Filter parameters for `logcat`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LogcatFilters {
    /// `tag:level` pairs joined by space, e.g. `MyApp:D *:S`.
    #[serde(default)]
    pub filter_spec: Option<String>,
    /// Show only lines whose message contains this substring.
    #[serde(default)]
    pub text: Option<String>,
}

/// A single file entry returned by `list_files`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    /// ISO 8601 modification time.
    pub modified: String,
    pub is_dir: bool,
    /// Unix-style permission string, e.g. `rwxr-xr-x`.
    pub perms: String,
}

/// Adb version info returned by `validate_adb`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AdbVersionInfo {
    pub version: String,
    pub version_string: String,
    pub path: String,
}

/// Adb configuration returned by `get_adb_config`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AdbConfig {
    /// Resolved adb path (or empty if not found).
    pub path: String,
    pub version_info: Option<AdbVersionInfo>,
    /// Whether `adb` is from settings (`Some`) or auto-detected (`None`).
    pub custom: bool,
}

/// A shell preset, returned by `list_shell_presets`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellPreset {
    pub label: String,
    pub command: String,
    pub description: String,
}

/// Format for `export_history`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Json,
}

/**
 * TypeScript types mirroring the Rust backend types in
 * `src-tauri/src/adb/models.rs` and `src-tauri/src/error.rs`.
 *
 * These are hand-written to match the `serde` serialization of the Rust
 * structs/enums exactly. Keep in sync when the Rust types change.
 */

/** State of an attached device, serialized lowercase via `serde(rename_all)`. */
export type DeviceState =
  | 'device'
  | 'offline'
  | 'unauthorized'
  | 'recovery'
  | 'bootloader'
  | 'sideload'
  | 'unknown';

/** A single attached device, parsed from `adb devices -l`. */
export interface Device {
  serial: string;
  state: DeviceState;
  transport_id?: string | null;
  usb?: string | null;
  model?: string | null;
  product?: string | null;
  device?: string | null;
}

/** A single installed package, parsed from `pm list packages`. */
export interface Package {
  name: string;
  is_system: boolean;
  is_third_party: boolean;
  is_disabled: boolean;
}

/** Filter applied to `pm list packages`, serialized lowercase. */
export type PackageFilter = 'all' | 'thirdparty' | 'system' | 'disabled';

/** Detailed information for a single package, parsed from `dumpsys package`. */
export interface PackageDetails {
  name: string;
  version_name?: string | null;
  version_code?: number | null;
  apk_path?: string | null;
  uid?: number | null;
  target_sdk?: number | null;
  min_sdk?: number | null;
  first_install_time?: string | null;
  last_update_time?: string | null;
  is_system: boolean;
  is_enabled: boolean;
}

/** Battery info, parsed from `dumpsys battery`. */
export interface BatteryInfo {
  level?: number | null;
  status?: number | null;
  powered?: boolean | null;
  ac_powered?: boolean | null;
  usb_powered?: boolean | null;
  temperature?: number | null;
  voltage?: number | null;
  technology?: string | null;
}

/** Aggregated device overview, shown on the Dashboard. */
export interface DeviceOverview {
  serial: string;
  model?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  android_version?: string | null;
  sdk_level?: number | null;
  build_id?: string | null;
  build_fingerprint?: string | null;
  security_patch?: string | null;
  abi?: string | null;
  screen_resolution?: string | null;
  screen_density?: number | null;
  battery?: BatteryInfo | null;
  selinux?: string | null;
  root?: boolean | null;
}

/** Flags passed to `adb install`. */
export interface InstallFlags {
  /** `-r` reinstall, preserving data. Defaults to false (serde default). */
  reinstall?: boolean;
  /** `-d` allow version downgrade. Defaults to false. */
  allow_downgrade?: boolean;
  /** `-g` grant all runtime permissions. Defaults to false. */
  grant_permissions?: boolean;
  /** Use `install-multiple` for split APKs. Defaults to false. */
  multiple?: boolean;
}

/** Outcome of an `adb install` invocation. */
export interface InstallResult {
  /** `Success` or `Failure`. */
  success: boolean;
  /** The raw first line of stdout. */
  message: string;
  /** When `success` is true, "Success"; otherwise the failure code. */
  code?: string | null;
}

/** Captured result of a single ADB command. */
export interface CmdResult {
  /** The full command string (for audit / console display). */
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

/** Result of a screenshot capture. */
export interface ScreenshotResult {
  local_path: string;
  remote_path: string;
  /** ISO 8601 timestamp of capture. */
  timestamp: string;
}

/** One entry in the command history. */
export interface HistoryEntry {
  id?: number | null;
  /** ISO 8601 timestamp. */
  timestamp: string;
  device_serial: string;
  /** e.g. `devices`, `packages`, `install`. */
  feature_module: string;
  command: string;
  exit_code?: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
}

/** Filter parameters for querying history. */
export interface HistoryFilter {
  /** Substring search on `command`. */
  search?: string | null;
  /** Filter by feature module. */
  module?: string | null;
  /** Filter by device serial. */
  serial?: string | null;
  /** ISO 8601 inclusive lower bound. */
  since?: string | null;
  /** ISO 8601 inclusive upper bound. */
  until?: string | null;
  /** Max rows to return (default 100). */
  limit?: number;
}

/** Filter parameters for `logcat`. */
export interface LogcatFilters {
  /** `tag:level` pairs joined by space, e.g. `MyApp:D *:S`. */
  filter_spec?: string | null;
  /** Show only lines whose message contains this substring. */
  text?: string | null;
}

/** Adb version info returned by `validate_adb`. */
export interface AdbVersionInfo {
  version: string;
  version_string: string;
  path: string;
}

/** Adb configuration returned by `get_adb_config`. */
export interface AdbConfig {
  /** Resolved adb path (or empty if not found). */
  path: string;
  version_info?: AdbVersionInfo | null;
  /** Whether `adb` is from settings (`true`) or auto-detected (`false`). */
  custom: boolean;
}

/** A shell preset, returned by `list_shell_presets`. */
export interface ShellPreset {
  label: string;
  command: string;
  description: string;
}

/** Format for `export_history`, serialized lowercase. */
export type ExportFormat = 'json';

/**
 * The single error type returned by all Tauri commands.
 *
 * Serialized with `#[serde(tag = "kind", content = "detail")]` so TypeScript
 * can pattern-match on `kind`. See `src-tauri/src/error.rs`.
 */
export type AdbError =
  | { kind: 'AdbNotFound'; detail: { searched_paths: string[] } }
  | { kind: 'AdbVersionCheckFailed'; detail: { stderr: string } }
  | { kind: 'NoDevices'; detail: null }
  | { kind: 'MultipleDevices'; detail: { serials: string[] } }
  | { kind: 'DeviceOffline'; detail: { serial: string } }
  | { kind: 'DeviceUnauthorized'; detail: { serial: string } }
  | {
      kind: 'CommandFailed';
      detail: { cmd: string; exit_code: number; stderr: string };
    }
  | { kind: 'CommandTimeout'; detail: { cmd: string; timeout_ms: number } }
  | {
      kind: 'ParseFailed';
      detail: { cmd: string; raw: string; reason: string };
    }
  | { kind: 'IoError'; detail: { message: string } }
  | { kind: 'InstallFailed'; detail: { code: string; explanation: string } }
  | { kind: 'InvalidInput'; detail: { field: string; reason: string } }
  | { kind: 'ProcessAlreadyRunning'; detail: { session_id: string } }
  | { kind: 'HistoryDbError'; detail: { message: string } };

/** Payload for the `logcat://line` event. */
export interface LogcatLineEvent {
  session_id: string;
  line: string;
}

/** Payload for the `process://exited` event. */
export interface ProcessExitedEvent {
  session_id: string;
  exit_code: number | null;
  duration_ms: number;
}

/** All registered Tauri command names, for type-safe `invoke`. */
export type TauriCommand =
  | 'list_devices'
  | 'kill_server'
  | 'start_server'
  | 'reconnect_device'
  | 'reconnect_offline'
  | 'get_device_overview'
  | 'list_packages'
  | 'get_package_details'
  | 'uninstall_package'
  | 'clear_package_data'
  | 'force_stop_package'
  | 'disable_package'
  | 'enable_package'
  | 'pull_apk'
  | 'launch_package'
  | 'open_app_settings'
  | 'install_apk'
  | 'cancel_install'
  | 'start_logcat'
  | 'stop_logcat'
  | 'clear_logcat_buffer'
  | 'run_shell'
  | 'list_shell_presets'
  | 'get_shell_favorites'
  | 'add_shell_favorite'
  | 'remove_shell_favorite'
  | 'take_screenshot'
  | 'get_adb_config'
  | 'set_adb_path'
  | 'validate_adb'
  | 'query_history'
  | 'rerun_history'
  | 'clear_history'
  | 'export_history';

/** Type guard: an unknown value is an AdbError if it has a known `kind`. */
export function isAdbError(value: unknown): value is AdbError {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    typeof kind === 'string' &&
    [
      'AdbNotFound',
      'AdbVersionCheckFailed',
      'NoDevices',
      'MultipleDevices',
      'DeviceOffline',
      'DeviceUnauthorized',
      'CommandFailed',
      'CommandTimeout',
      'ParseFailed',
      'IoError',
      'InstallFailed',
      'InvalidInput',
      'ProcessAlreadyRunning',
      'HistoryDbError',
    ].includes(kind)
  );
}

/**
 * Typed wrappers around Tauri `invoke`.
 *
 * One function per `#[tauri::command]` (37 total). In standalone Vite dev
 * (no Tauri runtime), falls back to the mock layer in `./mock.ts`.
 *
 * Errors are thrown as `AdbError` values — Tauri serializes the Rust
 * `Result::Err` into a JS object via `#[serde(tag = "kind", content = "detail")]`.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  AdbConfig,
  AdbVersionInfo,
  CmdResult,
  Device,
  DeviceOverview,
  ExportFormat,
  FileEntry,
  HistoryEntry,
  HistoryFilter,
  InstallFlags,
  InstallResult,
  LogcatFilters,
  Package,
  PackageDetails,
  PackageFilter,
  ScreenshotResult,
  ShellPreset,
} from '@/bindings/types';
import { isMockMode, mockInvoke } from './mock';

/** Resolves when running inside a Tauri webview; falls back to mock otherwise. */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isMockMode()) {
    return mockInvoke<T>(cmd, args);
  }
  return invoke<T>(cmd, args);
}

// ─── devices ────────────────────────────────────────────────────────────────

/** `adb devices -l` → list of attached devices. */
export function listDevices(): Promise<Device[]> {
  return call<Device[]>('list_devices');
}

/** `adb kill-server`. */
export function killServer(): Promise<void> {
  return call<void>('kill_server');
}

/** `adb start-server`. */
export function startServer(): Promise<void> {
  return call<void>('start_server');
}

/** `adb reconnect` for the given (or all) device(s). */
export function reconnectDevice(serial?: string | null): Promise<void> {
  return call<void>('reconnect_device', { serial: serial ?? null });
}

/** `adb reconnect offline`. */
export function reconnectOffline(): Promise<void> {
  return call<void>('reconnect_offline');
}

/** Aggregated `getprop` + `dumpsys battery` + `getenforce` + `wm size/density`. */
export function getDeviceOverview(serial?: string | null): Promise<DeviceOverview> {
  return call<DeviceOverview>('get_device_overview', { serial: serial ?? null });
}

// ─── packages ───────────────────────────────────────────────────────────────

/** `pm list packages` with the given filter. */
export function listPackages(
  serial: string | null,
  filter: PackageFilter,
): Promise<Package[]> {
  return call<Package[]>('list_packages', { serial, filter });
}

/** `dumpsys package <package>` parsed into `PackageDetails`. */
export function getPackageDetails(
  serial: string | null,
  pkg: string,
): Promise<PackageDetails> {
  return call<PackageDetails>('get_package_details', {
    serial,
    package: pkg,
  });
}

/** `pm uninstall [--user 0] <package>`. */
export function uninstallPackage(
  serial: string | null,
  pkg: string,
  forUser: boolean,
): Promise<void> {
  return call<void>('uninstall_package', {
    serial,
    package: pkg,
    for_user: forUser,
  });
}

/** `pm clear <package>` — wipes app data. */
export function clearPackageData(
  serial: string | null,
  pkg: string,
): Promise<void> {
  return call<void>('clear_package_data', { serial, package: pkg });
}

/** `am force-stop <package>`. */
export function forceStopPackage(
  serial: string | null,
  pkg: string,
): Promise<void> {
  return call<void>('force_stop_package', { serial, package: pkg });
}

/** `pm disable-user --user 0 <package>`. */
export function disablePackage(
  serial: string | null,
  pkg: string,
): Promise<void> {
  return call<void>('disable_package', { serial, package: pkg });
}

/** `pm enable <package>`. */
export function enablePackage(
  serial: string | null,
  pkg: string,
): Promise<void> {
  return call<void>('enable_package', { serial, package: pkg });
}

/** `pm path` then `adb pull` — saves APK to `destDir` (or Downloads). */
export function pullApk(
  serial: string | null,
  pkg: string,
  destDir?: string | null,
): Promise<string> {
  return call<string>('pull_apk', {
    serial,
    package: pkg,
    dest_dir: destDir ?? null,
  });
}

/** `monkey -p <package> -c android.intent.category.LAUNCHER 1`. */
export function launchPackage(
  serial: string | null,
  pkg: string,
): Promise<void> {
  return call<void>('launch_package', { serial, package: pkg });
}

/** Opens the system app-details settings screen. */
export function openAppSettings(
  serial: string | null,
  pkg: string,
): Promise<void> {
  return call<void>('open_app_settings', { serial, package: pkg });
}

// ─── install ─────────────────────────────────────────────────────────────────

/** `adb install [flags] <apks>` or `install-multiple` for split APKs. */
export function installApk(
  serial: string | null,
  apkPaths: string[],
  flags: InstallFlags,
): Promise<InstallResult> {
  return call<InstallResult>('install_apk', {
    serial,
    apk_paths: apkPaths,
    flags,
  });
}

/** Cancel an in-flight install by session id (no-op for MVP sync installs). */
export function cancelInstall(sessionId: string): Promise<void> {
  return call<void>('cancel_install', { session_id: sessionId });
}

// ─── files ──────────────────────────────────────────────────────────────────

/** `adb shell ls -la <path>` parsed into `FileEntry[]`. */
export function listFiles(
  serial: string | null,
  path: string,
): Promise<FileEntry[]> {
  return call<FileEntry[]>('list_files', { serial, path });
}

/** `adb pull <remote> <local>` → returns the local path. `local` defaults to Downloads. */
export function pullFile(
  serial: string | null,
  remote: string,
  local: string | null,
): Promise<string> {
  return call<string>('pull_file', { serial, remote, local });
}

/** `adb push <local> <remote>`. */
export function pushFile(
  serial: string | null,
  local: string,
  remote: string,
): Promise<void> {
  return call<void>('push_file', { serial, local, remote });
}

/** `adb shell rm -f <path>`. */
export function deleteFile(
  serial: string | null,
  path: string,
): Promise<void> {
  return call<void>('delete_file', { serial, path });
}

// ─── logs ───────────────────────────────────────────────────────────────────

/** Spawn `adb logcat` and stream lines via the `logcat://line` event. */
export function startLogcat(
  serial: string | null,
  filters: LogcatFilters,
): Promise<string> {
  return call<string>('start_logcat', { serial, filters });
}

/** Kill the logcat session by id. */
export function stopLogcat(sessionId: string): Promise<void> {
  return call<void>('stop_logcat', { session_id: sessionId });
}

/** `adb logcat -c`. */
export function clearLogcatBuffer(serial: string | null): Promise<void> {
  return call<void>('clear_logcat_buffer', { serial });
}

// ─── shell ──────────────────────────────────────────────────────────────────

/** Run `adb shell <command>` and capture stdout/stderr/exit code. */
export function runShell(
  serial: string | null,
  command: string,
): Promise<CmdResult> {
  return call<CmdResult>('run_shell', { serial, command });
}

/** Hardcoded preset list per spec §3.8. */
export function listShellPresets(): Promise<ShellPreset[]> {
  return call<ShellPreset[]>('list_shell_presets');
}

/** User's saved shell favorites. */
export function getShellFavorites(): Promise<string[]> {
  return call<string[]>('get_shell_favorites');
}

/** Add a favorite (dedup, no-op if already present). */
export function addShellFavorite(cmd: string): Promise<void> {
  return call<void>('add_shell_favorite', { cmd });
}

/** Remove a favorite by exact match. */
export function removeShellFavorite(cmd: string): Promise<void> {
  return call<void>('remove_shell_favorite', { cmd });
}

// ─── screenshot ─────────────────────────────────────────────────────────────

/** Capture a screenshot, pull it locally, return the local path + timestamp. */
export function takeScreenshot(
  serial: string | null,
  destDir?: string | null,
): Promise<ScreenshotResult> {
  return call<ScreenshotResult>('take_screenshot', {
    serial,
    dest_dir: destDir ?? null,
  });
}

// ─── settings ───────────────────────────────────────────────────────────────

/** Return the current adb path + version info (if resolvable). */
export function getAdbConfig(): Promise<AdbConfig> {
  return call<AdbConfig>('get_adb_config');
}

/** Set a custom adb path, or reset to auto by passing `null`. */
export function setAdbPath(path: string | null): Promise<AdbConfig> {
  return call<AdbConfig>('set_adb_path', { path });
}

/** Run `adb version` and return parsed info. */
export function validateAdb(): Promise<AdbVersionInfo> {
  return call<AdbVersionInfo>('validate_adb');
}

// ─── history ─────────────────────────────────────────────────────────────────

/** Query the SQLite command history with the given filter. */
export function queryHistory(filter: HistoryFilter): Promise<HistoryEntry[]> {
  return call<HistoryEntry[]>('query_history', { filter });
}

/** Fetch the stored entry by id (so the frontend can re-issue it). */
export function rerunHistory(entryId: number): Promise<HistoryEntry> {
  return call<HistoryEntry>('rerun_history', { entry_id: entryId });
}

/** Clear history older than `before` (ISO 8601), or all if null. */
export function clearHistory(before?: string | null): Promise<number> {
  return call<number>('clear_history', { before: before ?? null });
}

/** Export history as the given format (JSON only in MVP). */
export function exportHistory(
  filter: HistoryFilter,
  format: ExportFormat,
): Promise<string> {
  return call<string>('export_history', { filter, format });
}

/** Re-export so callers can branch on Tauri vs mock at the call site. */
export { isMockMode, isTauri };

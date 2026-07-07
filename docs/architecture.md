# Architecture

Reference for the ADB Buddy MVP. Source of truth for design decisions is the
spec at
[`docs/superpowers/specs/2026-07-04-adb-buddy-mvp-design.md`](../superpowers/specs/2026-07-04-adb-buddy-mvp-design.md).

---

## High-level diagram

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend (TS)                                    │
│  ─ Fluent UI v9 components                              │
│  ─ Zustand stores (devices, console, history, settings) │
│  ─ Feature modules: Dashboard, Apps, Logs, Shell          │
└───────────────┬─────────────────────────────────────────┘
                │  Tauri IPC (invoke + listen)
                │  Typed via hand-written bindings in src/bindings/
┌───────────────┴─────────────────────────────────────────┐
│  Rust Backend                                            │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐   │
│  │ adb_core   │  │ process    │  │ history (SQLite) │   │
│  │ (commands, │  │ (spawn,    │  │ rusqlite +       │   │
│  │  parsing)  │  │  stream,   │  │ migrations)      │   │
│  │            │  │  kill)     │  │                  │   │
│  └────────────┘  └────────────┘  └──────────────────┘   │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐   │
│  │ audit_log  │  │ settings   │  │ error model      │   │
│  │ (every cmd)│  │ (paths,    │  │ (AdbError enum)  │   │
│  │            │  │  adb path) │  │                  │   │
│  └────────────┘  └────────────┘  └──────────────────┘   │
└───────────────┬─────────────────────────────────────────┘
                │  tokio::process::Command
                ▼
            adb.exe / fastboot.exe (from PATH or custom)
```

---

## Module structure

### Rust backend — `src-tauri/src/`

| File | Responsibility |
|---|---|
| `main.rs` | Tauri entry, calls `adb_buddy_lib::run()`. |
| `lib.rs` | `run()` — registers plugins, manages state (AppSettings, ProcessRegistry, HistoryStore), registers all 34 commands, starts the Tauri runtime. |
| `error.rs` | `AdbError` enum (14 variants, tagged `kind`/`detail`), `From<io::Error>`, `From<rusqlite::Error>`, `From<serde_json::Error>`. |
| `adb/mod.rs` | Re-exports submodules. |
| `adb/models.rs` | All cross-boundary data types: `Device`, `DeviceState`, `Package`, `PackageFilter`, `PackageDetails`, `BatteryInfo`, `DeviceOverview`, `InstallFlags`, `InstallResult`, `CmdResult`, `ScreenshotResult`, `HistoryEntry`, `HistoryFilter`, `LogcatFilters`, `AdbVersionInfo`, `AdbConfig`, `ShellPreset`, `ExportFormat`. |
| `adb/path.rs` | `resolve_adb(custom)` and `resolve_fastboot(custom)` — uses `which` crate when no custom path is set. |
| `adb/runner.rs` | `AdbRunner` — builds `[adb, -s, serial, ...args]`, spawns via `tokio::process::Command`, captures stdout/stderr, returns `CmdResult` with full command string for audit. |
| `adb/parser/mod.rs` | Re-exports parsers. |
| `adb/parser/devices.rs` | `parse_devices(raw) -> Vec<Device>` — parses `adb devices -l` output. |
| `adb/parser/packages.rs` | `parse_packages(raw, filter) -> Vec<Package>` — parses `pm list packages` output. |
| `adb/parser/getprop.rs` | `parse_getprop(raw) -> Vec<(String, String)>` — parses `[key]: [value]` lines. |
| `adb/parser/battery.rs` | `parse_battery(raw) -> BatteryInfo` — parses `dumpsys battery`. |
| `adb/parser/install.rs` | `parse_install_result(stdout, stderr, exit_code)` — maps `INSTALL_FAILED_*` codes to `AdbError::InstallFailed` with explanations. |
| `process/mod.rs` | Re-exports. |
| `process/manager.rs` | `ProcessRegistry` — `HashMap<String, ChildHandle>` behind `tokio::sync::Mutex`. `register(session_id, child)`, `kill(session_id)`, `list()`. |
| `process/stream.rs` | `spawn_line_reader` — BufRead line reader that invokes a callback per line. Used by logcat. |
| `history/mod.rs` | Re-exports. |
| `history/schema.rs` | SQL migration string for `command_history` table + indexes. |
| `history/store.rs` | `HistoryStore` — `Mutex<Connection>` wrapper. `shared()` singleton, `insert(entry)`, `query(filter)`, `clear(before)`. Opens DB at `dirs::data_dir()/adb-buddy/history.db`. |
| `history/models.rs` | `HistoryEntry`, `HistoryFilter`. |
| `audit/mod.rs` | `audit_log(...)` — wraps `HistoryStore::insert()`. |
| `settings/mod.rs` | `AppSettings` — adb_path, fastboot_path, theme, history_retention_days, shell_favorites. `load()`, `save()`, `Default`. Stored at `dirs::data_dir()/adb-buddy/settings.json`. |
| `commands/mod.rs` | Re-exports command modules. |
| `commands/devices.rs` | `list_devices`, `kill_server`, `start_server`, `reconnect_device`, `reconnect_offline`, `get_device_overview`. |
| `commands/packages.rs` | `list_packages`, `get_package_details`, `uninstall_package`, `clear_package_data`, `force_stop_package`, `disable_package`, `enable_package`, `pull_apk`, `launch_package`, `open_app_settings`. |
| `commands/install.rs` | `install_apk`, `cancel_install`. |
| `commands/logs.rs` | `start_logcat` (emits `logcat://line` events), `stop_logcat`, `clear_logcat_buffer`. |
| `commands/shell.rs` | `run_shell`, `list_shell_presets`, `get_shell_favorites`, `add_shell_favorite`, `remove_shell_favorite`. |
| `commands/screenshot.rs` | `take_screenshot` — `screencap` + `pull`. |
| `commands/settings.rs` | `get_adb_config`, `set_adb_path`, `validate_adb`. |
| `commands/history.rs` | `query_history`, `rerun_history`, `clear_history`, `export_history`. |

### Frontend — `src/`

| Path | Responsibility |
|---|---|
| `main.tsx` | Entry — renders `<App/>` inside `<FluentProvider>` with theme from settings. |
| `App.tsx` | Router + AppShell layout. |
| `bindings/types.ts` | Hand-written TS types matching `adb/models.rs` + `error.rs`. `AdbError` is a discriminated union. |
| `ipc/client.ts` | Typed wrappers around `invoke()` for all 34 commands. |
| `ipc/events.ts` | Typed `listen()` wrappers for `logcat://line` and `process://exited`. |
| `ipc/mock.ts` | Mock IPC layer — used when `window.__TAURI_INTERNALS__` is undefined (standalone Vite dev). Returns canned devices, packages, history, etc. |
| `store/devices.ts` | Zustand — devices, selectedSerial, loading, error, refresh(), select(), multiSelectMode, selectedSerials. |
| `store/console.ts` | Zustand — lastCommand, history (last 50), append(r), clear(). |
| `store/logcat.ts` | Zustand — running, sessionId, lines (ring buffer 10k), filters, start(), stop(), parseLogLine() with isCrash/isAnr detection. |
| `store/settings.ts` | Zustand — adbPath, theme, historyRetentionDays, load(), save(). |
| `store/history.ts` | Zustand — entries, filters, loading, query(), clear(), exportEntries(). |
| `lib/errors.ts` | `explainError(e: AdbError) -> { title, fix, rawCmd? }` — covers all 14 variants. |
| `lib/format.ts` | `formatDuration(ms)`, `formatBytes(n)`, `formatTimestamp(iso)`. |
| `components/layout/AppShell.tsx` | Top-level layout: TopBar + NavRail + MainPanel + Console. |
| `components/layout/TopBar.tsx` | adb status dot, device dropdown, refresh, settings link, search. |
| `components/layout/NavRail.tsx` | Vertical navigation (48px). |
| `components/layout/MainPanel.tsx` | Renders routed feature content. |
| `components/layout/CommandConsole.tsx` | Bottom panel — last command + stdout/stderr/exit/duration + copy buttons. |
| `components/shared/ConfirmDialog.tsx` | Destructive-op confirmation: title, body, commandPreview, confirmLabel, destructive, onConfirm. |
| `components/shared/ErrorBanner.tsx` | Shows AdbError with `explainError()` output. |
| `components/shared/EmptyState.tsx` | icon + title + description + optional action. |
| `components/shared/LoadingSpinner.tsx` | Loading indicator. |
| `components/shared/CopyButton.tsx` | Clipboard copy with "Copied!" feedback. |
| `features/dashboard/DashboardPage.tsx` | Device overview cards. |
| `features/apps/AppsPage.tsx` | Package list + actions. |
| `features/install/InstallPage.tsx` | APK installer (drag-drop). |
| `features/logs/LogsPage.tsx` | Logcat viewer. |
| `features/shell/ShellPage.tsx` | Shell command runner. |
| `features/screenshot/ScreenshotPage.tsx` | Screenshot capture. |
| `features/settings/SettingsPage.tsx` | Settings. |
| `features/history/HistoryPage.tsx` | Command history. |

---

## IPC design

### Typed commands (request/response)

34 `#[tauri::command]` functions, each returning `Result<T, AdbError>`.
Frontend calls them via `invoke<Device[]>('list_devices')` and similar.
The `AdbError` enum serializes as a discriminated union:

```json
{ "kind": "DeviceUnauthorized", "detail": { "serial": "HA0XYY05" } }
{ "kind": "NoDevices", "detail": null }
```

The TS side pattern-matches:

```ts
switch (e.kind) {
  case 'DeviceUnauthorized':
    return { title: 'Device unauthorized', fix: 'Replug USB and accept RSA prompt.' };
  case 'NoDevices':
    return { title: 'No devices', fix: 'Connect a device over USB.' };
  // ...
}
```

### Streaming events

Long-running processes do **not** block on the `invoke` return. Instead:

| Event | Payload | Source |
|---|---|---|
| `logcat://line` | `{ session_id, line }` | `adb logcat` process |
| `process://exited` | `{ session_id, exit_code, duration_ms }` | any long-running |

Frontend subscribes with `listen('logcat://line', cb)` and unsubscribes on
unmount. The Rust `ProcessRegistry` tracks session IDs → child handles so
`stop_logcat(session_id)` can kill the process and emit `process://exited`.

### Process registry

```rust
pub struct ProcessRegistry {
    processes: tokio::sync::Mutex<HashMap<String, tokio::process::Child>>,
}
```

`start_logcat` calls `registry.register(session_id, child)`,
then spawns a task that reads lines and emits `logcat://line` per line.
On exit, the task emits `process://exited`. `stop_logcat(session_id)` calls
`registry.kill(session_id)`.

---

## Data flow — example: refresh devices

```
1. React: devicesStore.refresh()
2.   → ipc.client.listDevices()
3.     → invoke('list_devices')
4. Rust: commands::devices::list_devices()
5.   → adb::path::resolve_adb(None)  → finds adb in PATH
6.   → adb::runner.run(["devices", "-l"], None)
7.   → adb::parser::devices::parse(stdout) → Vec<Device>
8.   → history::store::insert(HistoryEntry { ... })   // audit
9.   ← returns Ok(Vec<Device>)
10. TS:   const devices = await listDevices()
11.   → devicesStore.set(devices)
12.   → consoleStore.append({ cmd: "adb devices -l", exit: 0, ... })
13. React re-renders Dashboard + TopBar device dropdown
```

---

## Multi-device handling

- `selected_serial: string | null` in `devicesStore`.
- Every command takes `serial: Option<String>`. Rust prepends `-s <serial>` to
  adb args when present.
- If `serial` is `None` and multiple devices are attached, Rust returns
  `AdbError::MultipleDevices { serials }`. Frontend shows a device picker.
- If `serial` is `None` and no devices are attached, Rust returns
  `AdbError::NoDevices`. Frontend shows "Connect a device" empty state.

---

## Mock mode (standalone frontend dev)

When `window.__TAURI_INTERNALS__` is `undefined` (i.e., the frontend is
running under plain Vite, not the Tauri webview), `src/ipc/mock.ts` provides
canned responses for every command. This lets designers and frontend devs
iterate on UI without Rust or a real device:

- 3 mock devices (Pixel 7 device, emulator offline, Galaxy unauthorized)
- 15 mock packages (mix of system/third-party)
- Mock install result (Success)
- Mock logcat lines emitted via `setInterval`
- Mock history entries

To use: `npm run dev` (not `npm run tauri:dev`).

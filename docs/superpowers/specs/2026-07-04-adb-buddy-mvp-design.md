# ADB Buddy — MVP Design Spec

**Date:** 2026-07-04
**Status:** Approved (pending implementation plan)
**Author:** Design session with user

---

## 0. Summary

ADB Buddy is a standalone Windows desktop application that provides a GUI over
`adb.exe` for Android developers, QA engineers, device testers, ROM engineers,
and technical product managers. It makes common ADB operations faster, safer,
and more visual, without repeatedly typing terminal commands.

This spec covers the **MVP first cut**: a usable v0.1 with the 10 highest-value
features, architected so the remaining full-spec modules can be added later
without rework.

### Key decisions (captured during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Tech stack | Tauri 2 + React + TypeScript + Rust | Spec's Option B. Developable on macOS (current dev env), builds for Windows. Smaller installer, cross-platform future. |
| adb binary | Auto-detect from PATH, custom path override in Settings | User choice. Smallest installer. Documented as a tradeoff against "offline-first out of the box." |
| AI troubleshooting | Excluded from MVP | Spec lists it as Optional and "AI log analysis" as an MVP non-goal. Hooks reserved for later. |
| Scope | MVP-only first cut (10 items) | Ship a usable v0.1, then iterate. |
| Architecture | Rust-heavy (Approach A) | Rust owns ADB process lifecycle, structured parsing, SQLite history, audit log. TS is presentation + IPC. Strong typing end-to-end via `ts-rs`. |

---

## 1. Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend (TS)                                    │
│  ─ Fluent UI v9 components                              │
│  ─ Zustand stores (devices, console, history, settings)│
│  ─ Feature modules: Dashboard, Apps, Files, Logs, Shell │
└───────────────┬─────────────────────────────────────────┘
                │  Tauri IPC (invoke + listen)
                │  Typed via ts-rs generated .ts bindings
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

### 1.2 Module Structure

```
adb-buddy/
├── src-tauri/                          # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs                     # Tauri entry, command registration
│   │   ├── error.rs                    # AdbError enum + Into<InvokeError>
│   │   ├── commands/                   # #[tauri::command] handlers
│   │   │   ├── mod.rs
│   │   │   ├── devices.rs              # list_devices, kill_server, etc.
│   │   │   ├── packages.rs             # list_packages, uninstall, clear...
│   │   │   ├── install.rs              # install_apk, install_split
│   │   │   ├── files.rs                # pull, push, list, delete
│   │   │   ├── logs.rs                 # start_logcat, stop_logcat, clear
│   │   │   ├── shell.rs                # run_shell, run_preset
│   │   │   ├── screenshot.rs           # take_screenshot
│   │   │   ├── settings.rs             # get/set adb path, settings
│   │   │   └── history.rs              # query, re-run, clear history
│   │   ├── adb/                        # Core ADB abstraction
│   │   │   ├── mod.rs
│   │   │   ├── path.rs                 # resolve adb.exe (PATH/custom)
│   │   │   ├── runner.rs               # spawn, stream, kill; CmdResult
│   │   │   ├── parser/
│   │   │   │   ├── devices.rs          # parse `adb devices -l`
│   │   │   │   ├── packages.rs         # parse `pm list packages`
│   │   │   │   ├── getprop.rs          # parse `getprop`
│   │   │   │   ├── battery.rs          # parse `dumpsys battery`
│   │   │   │   └── install.rs          # parse install error codes
│   │   │   └── models.rs              # Device, Package, BatteryInfo...
│   │   ├── process/
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs             # ProcessRegistry (logcat, screenrecord)
│   │   │   └── stream.rs              # line-buffered stream → events
│   │   ├── history/
│   │   │   ├── mod.rs
│   │   │   ├── store.rs                # rusqlite wrapper
│   │   │   ├── schema.rs               # migrations
│   │   │   └── models.rs               # HistoryEntry
│   │   ├── audit/
│   │   │   └── mod.rs                  # audit_log(command, exit, duration)
│   │   ├── settings/
│   │   │   └── mod.rs                  # paths config, persisted to JSON
│   │   └── lib.rs
│   └── migrations/                      # .sql files
│
├── src/                                # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── bindings/                       # ts-rs generated types
│   │   └── (Device.ts, Package.ts, ...)
│   ├── ipc/
│   │   ├── client.ts                   # typed wrappers around invoke()
│   │   └── events.ts                   # typed event listeners
│   ├── store/
│   │   ├── devices.ts                  # Zustand: devices, selectedSerial
│   │   ├── console.ts                  # Zustand: current command, output
│   │   ├── history.ts                  # Zustand: history list, filters
│   │   ├── settings.ts                 # Zustand: adb path, theme
│   │   └── logcat.ts                   # Zustand: logcat lines, filters
│   ├── components/
│   │   ├── layout/                     # TopBar, NavRail, MainPanel, Console
│   │   ├── shared/                     # ConfirmDialog, ErrorBanner, EmptyState
│   │   └── console/                    # CommandConsole, OutputView
│   ├── features/
│   │   ├── dashboard/
│   │   ├── apps/
│   │   ├── install/
│   │   ├── files/
│   │   ├── logs/
│   │   ├── shell/
│   │   ├── settings/
│   │   └── history/
│   ├── lib/
│   │   ├── errors.ts                   # TS-side AdbError mapping
│   │   └── format.ts                   # time, size, etc.
│   └── styles/
│
├── tests/                              # Rust integration tests
│   └── fixtures/                       # sample adb outputs
│
└── docs/
```

### 1.3 IPC Design

**Typed commands (request/response):**

```rust
#[tauri::command]
async fn list_devices(adb: State<'_, AdbPath>) -> Result<Vec<Device>, AdbError> { ... }

#[tauri::command]
async fn install_apk(
    serial: Option<String>,
    apk_path: String,
    flags: InstallFlags,
) -> Result<InstallResult, AdbError> { ... }
```

`ts-rs` generates TypeScript types from these structs (`Device`, `Package`,
`InstallResult`, `AdbError`). Frontend imports them — no manual sync.

**Streaming commands (events, not return values):**

| Event channel | Payload | Source |
|---|---|---|
| `logcat://line` | `{ session_id, line }` | logcat process |
| `shell://line` | `{ session_id, line }` | shell process |
| `install://progress` | `{ percent, stage: 'pushing'\|'installing'\|'done' }` | install |
| `process://exited` | `{ pid, exit_code, duration_ms }` | any long-running |

Frontend listens via `listen<T>('logcat://line', cb)` with typed payload.

**Process registry (Rust side):**

`ProcessRegistry` holds `HashMap<Pid, ChildHandle>` for long-running processes
(logcat, screenrecord). Frontend calls `stop_logcat(session_id)` → Rust kills
the child → emits `process://exited`.

### 1.4 Data Flow — Example: "Refresh devices"

```
1. React: devicesStore.refresh()
2.   → ipc.client.listDevices()
3.     → invoke('list_devices')
4. Rust: commands::devices::list_devices()
5.   → adb::path::resolve() → finds adb.exe in PATH
6.   → adb::runner::run(["devices", "-l"])
7.   → adb::parser::devices::parse(stdout) → Vec<Device>
8.   → history::store::insert(HistoryEntry { ... })   // audit
9.   → audit::log(...)
10.  ← returns Ok(Vec<Device>)
11. TS:   const devices = await listDevices()
12.   → devicesStore.set(devices)
13.   → consoleStore.setLast({ cmd: "adb devices -l", exit: 0, ... })
14. React re-renders Dashboard + NavRail
```

**For long-running streams (logcat):**

```
1. React: logcatStore.start({ filter: "MyApp:*" })
2.   → invoke('start_logcat', { filter }) → returns session_id immediately
3. Rust: spawns `adb logcat`, registers in ProcessRegistry
4.   → for each line: emit('logcat://line', { session_id, line })
5. TS:   listen('logcat://line', payload => logcatStore.append(payload))
6. User clicks Stop → invoke('stop_logcat', { session_id })
7. Rust: registry.kill(session_id), emit('process://exited', ...)
8.   → history::store::insert(...)  // audit the run
```

### 1.5 Multi-Device Handling

- `selected_serial: Option<String>` in `devicesStore`
- All typed commands take `serial: Option<String>` → Rust prepends
  `-s <serial>` to adb args
- If `None` and multiple devices present → return
  `AdbError::MultipleDevices` → frontend shows device picker dialog
- If `None` and no devices → return `AdbError::NoDevices` → frontend shows
  "Connect a device" empty state

---

## 2. UI, State, Errors, Testing, Packaging

### 2.1 Layout & UI Framework

**Framework:** Fluent UI React v9 (`@fluentui/react-components`) — authentic
Windows 11 feel on Windows, renders fine on macOS during dev.

**Layout** (matches spec's main layout):

```
┌────────────────────────────────────────────────────────────┐
│ TopBar: [● adb OK] [▼ Pixel 7 - device] [↻] [⚙] [🔍]      │
├──────┬─────────────────────────────────────────────────────┤
│ Nav  │  Main Panel                                         │
│ Rail │  ┌───────────────────────────────────────────────┐  │
│      │  │  Feature content (Dashboard / Apps / ...)     │  │
│  □   │  │                                                │  │
│  📦  │  │                                                │  │
│  📁  │  │                                                │  │
│  📜  │  │                                                │  │
│  >_  │  │                                                │  │
│  ℹ   │  │                                                │  │
│  📷  │  └───────────────────────────────────────────────┘  │
│  ⚙   │  ┌───────────────────────────────────────────────┐  │
│  🕓   │  │ Console: adb devices -l | exit 0 | 142ms      │  │
│      │  │ stdout: List of devices attached ...           │  │
│      │  │ [copy cmd] [copy out]                          │  │
│      │  └───────────────────────────────────────────────┘  │
└──────┴─────────────────────────────────────────────────────┘
```

- **NavRail** (vertical, 48px): collapses to icons only, expandable to show labels
- **TopBar** (48px): adb status dot (green/red), device dropdown, refresh,
  settings, global search
- **MainPanel**: feature route content
- **Console** (resizable, bottom): always visible, shows last command +
  stdout/stderr/exit/duration + copy buttons

### 2.2 Routing

`react-router-dom` with routes matching MVP modules:

| Route | Feature |
|---|---|
| `/` | redirect to `/dashboard` (or `/devices` if no device) |
| `/dashboard` | device overview |
| `/apps` | package list + actions |
| `/install` | APK installer (drag-drop) |
| `/files` | basic file browser (MVP: `/sdcard/` + `/data/local/tmp/`) |
| `/logs` | logcat viewer |
| `/shell` | shell runner |
| `/screenshot` | capture & save |
| `/settings` | adb path, theme, history retention |
| `/history` | command history list |

Non-MVP routes (Fastboot, Network, Permissions, Battery, Display, Input,
DevOptions, Settings Editor) are **not registered** in MVP — nav items hidden,
but feature folders reserved in `src/features/` for later.

### 2.3 State Management (Zustand)

Four stores, kept small and focused:

```ts
// store/devices.ts
interface DevicesState {
  devices: Device[];
  selectedSerial: string | null;
  loading: boolean;
  error: AdbError | null;
  refresh: () => Promise<void>;
  select: (serial: string) => void;
  multiSelectMode: boolean;
  selectedSerials: Set<string>;
}

// store/console.ts
interface ConsoleState {
  lastCommand: CommandResult | null;
  history: CommandResult[];          // last N (e.g., 50) for quick view
  append: (r: CommandResult) => void;
  clear: () => void;
}
interface CommandResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timestamp: string;
}

// store/logcat.ts
interface LogcatState {
  running: boolean;
  sessionId: string | null;
  lines: LogLine[];                  // ring buffer, max 10k
  filters: { tag: string; level: Level[]; text: string; package: string };
  start: (filters) => Promise<void>;
  stop: () => Promise<void>;
}
interface LogLine {
  timestamp: string; pid: number; tid: number;
  level: 'V'|'D'|'I'|'W'|'E'|'F';
  tag: string; message: string;
  isCrash: boolean; isAnr: boolean;
}

// store/settings.ts
interface SettingsState {
  adbPath: 'auto' | string;          // 'auto' = use PATH
  theme: 'system' | 'light' | 'dark';
  historyRetentionDays: number;      // default 30
  // Reserved for AI (not implemented in MVP):
  // aiEnabled, aiProvider, aiApiKey, aiPreviewPayload
}
```

### 2.4 AdbError Model

One Rust enum, serialized to TS via `ts-rs`. Frontend has a single
`explainError()` function that maps to human-readable message + suggested fix.

```rust
// src-tauri/src/error.rs
#[derive(Serialize, Type)]
#[serde(tag = "kind", content = "detail")]
pub enum AdbError {
    AdbNotFound { searched_paths: Vec<String> },
    AdbVersionCheckFailed { stderr: String },
    NoDevices,
    MultipleDevices { serials: Vec<String> },
    DeviceOffline { serial: String },
    DeviceUnauthorized { serial: String },
    CommandFailed { cmd: String, exit_code: i32, stderr: String },
    CommandTimeout { cmd: String, timeout_ms: u64 },
    ParseFailed { cmd: String, raw: String, reason: String },
    IoError { message: String },
    InstallFailed { code: String, explanation: String },  // INSTALL_FAILED_*
    InvalidInput { field: String, reason: String },
    ProcessAlreadyRunning { session_id: String },
    HistoryDbError { message: String },
    // Reserved (not in MVP): AiNotConfigured, AiPayloadRejected
}
```

**Frontend `lib/errors.ts`:**

```ts
export function explainError(e: AdbError): {
  title: string;
  fix: string;
  rawCmd?: string;
} {
  switch (e.kind) {
    case 'AdbNotFound':
      return {
        title: 'adb.exe not found',
        fix: 'Install platform-tools or set a custom adb path in Settings.',
      };
    case 'DeviceUnauthorized':
      return {
        title: 'Device unauthorized',
        fix: 'Replug the USB cable and accept the RSA prompt on the device.',
      };
    case 'MultipleDevices':
      return {
        title: 'Multiple devices connected',
        fix: 'Select a device from the top bar dropdown.',
      };
    case 'InstallFailed':
      return {
        title: `Install failed: ${e.detail.code}`,
        fix: e.detail.explanation,
      };
    // ... all other variants
  }
}
```

### 2.5 Confirmations & Safety

Single reusable `<ConfirmDialog>` component, used for all destructive ops:

```tsx
<ConfirmDialog
  title="Clear app data?"
  body="This will permanently clear all data for com.example.app on device Pixel 7."
  commandPreview="adb shell pm clear com.example.app"
  confirmLabel="Clear data"
  destructive
  onConfirm={() => clearData(...)}
/>
```

MVP destructive ops requiring confirmation:

- Uninstall / clear data / force stop
- Disable system app (detect via `flags & FLAG_SYSTEM` on `Package`)
- Install with `-r -d` (downgrade)
- File delete (`adb shell rm`)
- Screenshot overwrite (when destination file already exists)

### 2.6 Testing Strategy

**Rust unit tests** (in `src-tauri/src/adb/parser/*.rs`):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_devices_l_valid() {
        let raw = include_str!("../../../tests/fixtures/devices_l.txt");
        let devices = parse_devices(raw).unwrap();
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].serial, "HA0XYY05");
        assert_eq!(devices[0].state, DeviceState::Device);
        assert_eq!(devices[0].model, Some("Pixel_7".into()));
    }

    #[test]
    fn parse_devices_unauthorized() { ... }
    #[test]
    fn parse_devices_offline() { ... }
    #[test]
    fn parse_devices_malformed_returns_error() { ... }
}
```

**Fixtures** (`tests/fixtures/`): real captured adb outputs
(`devices_l.txt`, `pm_list_-3.txt`, `dumpsys_battery.txt`, `getprop.txt`,
`install_failure_*.txt`, etc.).

**Rust integration tests** (`tests/`):

- `process_integration.rs` — spawn a known command (`adb version` against a
  mock binary), assert `CmdResult` fields. Skipped if adb not in PATH.
- `history_store.rs` — round-trip insert + query against in-memory SQLite.

**Frontend tests** (Vitest):

- `lib/errors.test.ts` — `explainError` for each variant.
- `store/devices.test.ts` — reducer logic with mocked IPC.

**Manual test matrix** (documented in README, not automated):
- Real device: Pixel, Samsung, emulator
- States: device / offline / unauthorized / no devices / multiple

### 2.7 Packaging & Distribution

**Build:**
- `npm run tauri build` on Windows → produces `.msi` (WiX) and `.exe` (NSIS)
  installers
- Target: `x86_64-pc-windows-msvc`
- App size: ~8–15 MB (Tauri 2 + Rust, no bundled adb)

**Installer config** (`tauri.conf.json`):
- Product name: `ADB Buddy`
- Identifier: `com.adbbuddy.app`
- Copyright, version from `package.json`
- No code signing in MVP (documented as limitation; user sees SmartScreen
  warning)

**CI** (`.github/workflows/build-windows.yml`):
- Trigger: push tag `v*`
- Runner: `windows-latest`
- Steps: setup Node + Rust, `npm ci`, `npm run tauri build`
- Upload `.msi` + `.exe` as release artifacts

**macOS dev workflow** (documented in README):
- `npm run tauri dev` works (UI + Rust both build on macOS)
- adb commands will fail with `AdbError::AdbNotFound` since there is no
  `adb.exe` — this is expected. The frontend handles this gracefully, so all
  error states, empty states, and UI flows are exercisable on macOS without
  a real device.
- For UI-only iteration, `npm run dev` (Vite) runs the frontend standalone
  with a mock IPC layer that returns canned `Device` / `Package` data — no
  Rust backend required.
- Cross-compile to Windows is not configured in MVP; rely on CI or a Windows
  VM for Windows builds.

### 2.8 README & Docs Plan

- `README.md` — overview, screenshots, install, dev setup (macOS + Windows),
  build, test
- `docs/architecture.md` — this design doc + diagrams
- `docs/commands-reference.md` — every adb command the app runs, mapped to UI
  action (audit reference)
- `docs/safety.md` — list of destructive ops + their confirmations
- `docs/troubleshooting.md` — common errors + fixes (mirrors `AdbError`)

### 2.9 Out of Scope (MVP)

Explicitly **not** built:

- Fastboot (deferred per spec)
- Root-only features
- Full file explorer (only `/sdcard/` + `/data/local/tmp/` browse + pull/push/delete)
- AI troubleshooting (hooks reserved, no implementation)
- Plugin system, cloud sync, accounts
- Code signing (documented as MVP limitation)
- Settings editor, Battery sim, Display change, Input simulation, Network
  TCP/IP, Permissions, Developer Options (full-spec nav items hidden in MVP)

### 2.10 Deliverables Summary

| Deliverable | Status |
|---|---|
| Working Windows .msi/.exe | ✓ via CI |
| Clean architecture (Rust core + TS presentation) | §1 |
| README | §2.8 |
| Build instructions | §2.7 |
| Module structure | §1.2 |
| Basic unit tests | §2.6 |
| Error handling | §2.4, §2.5 |
| Installer packaging plan | §2.7 |

---

## 3. MVP Feature Specs

The 10 MVP features, in priority order. Each maps to spec sections in the
original product vision.

### 3.1 ADB Path Management (Settings)

**User actions:**
- View current adb path (auto-detected from PATH or custom)
- Set custom adb path (file picker)
- Reset to auto
- View adb version (`adb version`)
- Validate adb availability

**Tauri commands:**
- `get_adb_config() -> AdbConfig`
- `set_adb_path(path: String) -> Result<AdbConfig, AdbError>`
- `validate_adb() -> Result<AdbVersionInfo, AdbError>`

**Rust modules:** `adb::path`, `settings`, `commands::settings`

**UI:** Settings page → "ADB" section.

### 3.2 Device Detection

**User actions:**
- Refresh device list
- View serial, state, model, product, transport ID, USB/TCP, Android version,
  SDK level, battery, root status
- Select active device (single or multi)
- Reconnect / kill server / start server

**Tauri commands:**
- `list_devices() -> Result<Vec<Device>, AdbError>`
- `kill_server() -> Result<(), AdbError>`
- `start_server() -> Result<(), AdbError>`
- `reconnect_device(serial: Option<String>) -> Result<(), AdbError>`
- `reconnect_offline() -> Result<(), AdbError>`

**Rust modules:** `adb::runner`, `adb::parser::devices`, `commands::devices`

**UI:** TopBar device dropdown, Dashboard device card.

### 3.3 Dashboard

**User actions:**
- View selected device overview: name, Android version, SDK level, build
  fingerprint, security patch, battery, screen resolution, density, CPU ABI,
  storage, network state, root status, SELinux status, current foreground app

**Tauri commands:**
- `get_device_overview(serial: Option<String>) -> Result<DeviceOverview, AdbError>`

Internally runs `getprop`, `wm size`, `wm density`, `dumpsys battery`,
`getenforce`, `dumpsys activity activities` — parallelized where possible.

**Rust modules:** `adb::parser::getprop`, `adb::parser::battery`,
`commands::devices`

**UI:** Dashboard feature page.

### 3.4 Package List

**User actions:**
- List installed packages (with `-3`, `-s`, `-d` filters)
- Search by package name
- Show version name/code, APK path, UID, target SDK (via `dumpsys package`)
- Disable / enable / force stop / clear data / uninstall
- Pull APK
- Launch app (`monkey -p <pkg> 1`)
- Open app settings

**Tauri commands:**
- `list_packages(serial, filter: PackageFilter) -> Result<Vec<Package>, AdbError>`
- `get_package_details(serial, package) -> Result<PackageDetails, AdbError>`
- `uninstall_package(serial, package, for_user: bool) -> Result<(), AdbError>`
- `clear_package_data(serial, package) -> Result<(), AdbError>`
- `force_stop_package(serial, package) -> Result<(), AdbError>`
- `disable_package(serial, package) -> Result<(), AdbError>`
- `enable_package(serial, package) -> Result<(), AdbError>`
- `pull_apk(serial, package, dest_dir) -> Result<String, AdbError>`
- `launch_package(serial, package) -> Result<(), AdbError>`
- `open_app_settings(serial, package) -> Result<(), AdbError>`

**Rust modules:** `adb::parser::packages`, `commands::packages`

**UI:** Apps feature page — DataGrid with filters, search, action menu.

### 3.5 Install APK

**User actions:**
- Drag APK file(s) into installer area
- Choose APK via file picker
- Select install options: reinstall (`-r`), downgrade (`-d`),
  grant permissions (`-g`), split APKs (`install-multiple`)
- View install progress (pushing / installing / done)
- View result with human-readable error explanation
- Re-run last install

**Tauri commands:**
- `install_apk(serial, apk_paths: Vec<String>, flags: InstallFlags) -> Result<InstallResult, AdbError>`
- `cancel_install(session_id: String) -> Result<(), AdbError>`

**Events:** `install://progress`

**Rust modules:** `adb::parser::install`, `commands::install`

**UI:** Install feature page — drag-drop zone, options checkboxes, progress
bar, result panel.

**Common install error explanations (mapped in `AdbError::InstallFailed`):**

| Code | Explanation |
|---|---|
| `INSTALL_FAILED_VERSION_DOWNGRADE` | App already installed with a higher version. Enable "Allow downgrade" or uninstall first. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Existing app has a different signature. Uninstall it first. |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | APK doesn't contain native libs for the device's CPU ABI. Use a universal APK. |
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | Device is out of storage. Free space or clear app cache. |
| `INSTALL_PARSE_FAILED_NO_CERTIFICATES` | APK is not signed. Re-sign it before installing. |

### 3.6 Uninstall / Clear Data / Force Stop

Covered under §3.4. The actions appear both in the Apps list (per-row action
menu) and as standalone quick actions on the Dashboard's "current foreground
app" card.

### 3.7 Logcat Viewer

**User actions:**
- Start / stop logcat stream
- Clear logcat buffer on device (`adb logcat -c`)
- Filter by tag, level, text, package
- Search text in current buffer
- Save logs to file
- Highlight crashes (`FATAL EXCEPTION`), ANRs (`ANR in`), exceptions
- Jump to next/previous crash

**Tauri commands:**
- `start_logcat(serial, filters: LogcatFilters) -> Result<SessionId, AdbError>`
- `stop_logcat(session_id: String) -> Result<(), AdbError>`
- `clear_logcat_buffer(serial) -> Result<(), AdbError>`
- `save_logs(lines: Vec<LogLine>, dest_path: String) -> Result<(), AdbError>`

**Events:** `logcat://line`, `process://exited`

**Rust modules:** `process::manager`, `process::stream`, `commands::logs`

**UI:** Logs feature page — toolbar (start/stop/clear/save), filter bar,
virtualized log list (windowing for performance), crash/ANR highlight.

### 3.8 Shell Command Runner

**User actions:**
- Run one-off `adb shell <command>`
- View stdout, stderr, exit code, duration
- Preset commands (dropdown): `getprop`, `dumpsys activity`, `dumpsys window`,
  `dumpsys package`, `dumpsys battery`, `dumpsys deviceidle`,
  `settings list global`, `settings list secure`, `settings list system`
- Command favorites (saved to settings)
- History (last N shell commands)
- Copy command, copy output

**Tauri commands:**
- `run_shell(serial, command: String) -> Result<CmdResult, AdbError>`
- `list_shell_presets() -> Vec<ShellPreset>`
- `get_shell_favorites() -> Vec<String>`
- `add_shell_favorite(cmd: String) -> Result<(), AdbError>`
- `remove_shell_favorite(cmd: String) -> Result<(), AdbError>`

**Rust modules:** `commands::shell`, `adb::runner`

**UI:** Shell feature page — command input with autocomplete from
presets+favorites+history, run button, output panel.

### 3.9 Screenshot

**User actions:**
- Capture screenshot (`adb shell screencap -p /sdcard/screenshot.png`)
- Auto-pull to local folder
- Save as PNG with timestamp
- Choose save destination
- Overwrite warning if file exists

**Tauri commands:**
- `take_screenshot(serial, dest_dir: Option<String>) -> Result<ScreenshotResult, AdbError>`

**Rust modules:** `commands::screenshot`, `adb::runner`

**UI:** Screenshot feature page — capture button, preview, save-as dialog.

### 3.10 Command Console & History

**Command Console** (bottom panel, always visible):
- Shows last executed command
- Shows stdout, stderr, exit code, duration
- Copy command button, copy output button
- Expand/collapse for full output

**Command History** (full page at `/history`):
- Searchable list of all executed commands
- Columns: timestamp, device serial, feature module, command, exit code,
  duration
- Row actions: re-run, copy command, view stdout/stderr
- Export (MVP: JSON), clear history

**Tauri commands:**
- `query_history(filter: HistoryFilter) -> Result<Vec<HistoryEntry>, AdbError>`
- `rerun_history(entry_id: i64) -> Result<CmdResult, AdbError>`
- `clear_history(before: Option<DateTime>) -> Result<(), AdbError>`
- `export_history(filter, format: ExportFormat) -> Result<String, AdbError>`

**SQLite schema:**

```sql
CREATE TABLE command_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,           -- ISO 8601
  device_serial TEXT NOT NULL,
  feature_module TEXT NOT NULL,      -- 'devices', 'packages', 'install', ...
  command TEXT NOT NULL,
  exit_code INTEGER,                 -- NULL if killed
  duration_ms INTEGER NOT NULL,
  stdout TEXT,
  stderr TEXT
);
CREATE INDEX idx_history_timestamp ON command_history(timestamp DESC);
CREATE INDEX idx_history_command ON command_history(command);
CREATE INDEX idx_history_module ON command_history(feature_module);
```

**Rust modules:** `history::store`, `history::schema`, `commands::history`

**UI:** `components/console/CommandConsole` (bottom panel),
`features/history/HistoryPage`.

---

## 4. Reserved (Not Implemented in MVP)

These areas have folder/file reservations in the architecture but no
implementation. Hooks are designed so they can be added later without
breaking changes:

- **AI troubleshooting** — `AdbError` has reserved variants; settings store
  has reserved fields; no UI surfaced in MVP.
- **Fastboot** — no nav item, no route, no commands. Folder not reserved
  (will be created when added).
- **Full file explorer** — MVP limits to `/sdcard/` and `/data/local/tmp/`.
  `files` command module designed to extend.
- **Settings editor, Battery sim, Display, Input, Network, Permissions,
  DevOptions** — hidden nav items, no routes. Full-spec design (§5) covers
  future addition.

## 5. Full-Spec Roadmap (Post-MVP)

Not implemented in MVP. Listed for architectural reference — the module
structure in §1.2 was designed to accommodate these without rework:

- Files (full): protected paths, rename, mkdir, recursive delete
- Network: TCP/IP ADB, connect/disconnect, IP info
- Permissions: per-package grant/revoke, dangerous highlight
- Battery: sim, reset stats, Doze
- Display: resolution/density change, screen record
- Input: text/keyevent/tap/swipe
- Developer Options: animation scales, show touches, stay awake
- Fastboot: detect, getvar, reboot, flash (with strong confirmation)
- Settings Editor: global/secure/system tabs, edit/delete with restore
- AI Troubleshooting: explain crash, summarize ANR, provider config,
  privacy preview, off-by-default
- Export: Markdown / HTML / CSV (JSON only in MVP)
- Code signing for installer
- ARM64 Windows build

---

## 6. Open Questions

None. All clarifying questions resolved during brainstorming.

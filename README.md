# ADB Buddy

A standalone Windows desktop application that provides a GUI over `adb.exe` for
Android developers, QA engineers, device testers, ROM engineers, and technical
product managers. It makes common ADB operations faster, safer, and more
visual — without repeatedly typing terminal commands.

> **Status:** MVP v0.1. Built against the design spec at
> [docs/superpowers/specs/2026-07-04-adb-buddy-mvp-design.md](docs/superpowers/specs/2026-07-04-adb-buddy-mvp-design.md).

---

## Highlights

- **Native Windows feel** — Tauri 2 + Fluent UI React v9. Installer is
  ~8–15 MB (no Electron, no bundled adb).
- **Structured workflows** — Every GUI action maps to an auditable ADB
  command. All commands land in a local SQLite-backed history with stdout,
  stderr, exit code, duration, device serial, and feature module.
- **Non-blocking** — Long-running operations (logcat, install) stream
  results to the UI via Tauri events.
- **Safe by default** — Destructive operations (uninstall, clear data,
  disable system app, delete files, downgrade install) require an explicit
  confirmation dialog that shows the exact command to be executed.
- **Multi-device** — Select the active device from the top bar; all
  commands target that serial. Multiple devices are surfaced as a clear
  picker, not silent ambiguity.
- **Offline-first** — No cloud dependency for any core ADB feature. AI
  troubleshooting hooks are reserved but not implemented in MVP.

---

## MVP feature set

| # | Feature | Status |
|---|---|---|
| 1 | ADB path management (auto from PATH, custom override) | ✓ |
| 2 | Device detection & multi-device selection | ✓ |
| 3 | Dashboard (device overview: build, battery, display, root, SELinux, ...) | ✓ |
| 4 | Package list (filter system/third-party/disabled, search) | ✓ |
| 5 | Install APK (drag-drop, multi/split, downgrade, grant permissions) | ✓ |
| 6 | Uninstall / clear data / force stop / disable / enable | ✓ |
| 7 | Logcat viewer (streaming, filter by tag/level/text, crash/ANR highlight) | ✓ |
| 8 | Shell command runner (presets, favorites, history, Ctrl+Enter) | ✓ |
| 9 | Screenshot capture & pull | ✓ |
| 10 | Command console (always-visible bottom panel) + history page | ✓ |

Out of scope for MVP (deferred per spec §2.9): Fastboot, root-only features,
full file explorer (only `/sdcard/` + `/data/local/tmp/` browse/pull/push/delete
in MVP), AI troubleshooting, plugin system, cloud sync, code signing, and the
remaining full-spec nav items (Network, Permissions, Battery sim, Display,
Input, Developer Options, Settings Editor).

---

## Tech stack

- **Frontend:** React 18 + TypeScript + Vite 6 + Fluent UI React v9 + Zustand
- **Backend:** Rust + Tauri 2 + tokio + rusqlite (SQLite) + ts-rs
- **Packaging:** Tauri 2 bundle → `.msi` (WiX) and `.exe` (NSIS) for Windows.
  Installer is unsigned in MVP — Windows SmartScreen will warn on first run.
  Code signing requires a certificate (EV recommended); set
  `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  environment variables to enable automatic signing.

Architecture is **Rust-heavy** (Approach A in the design spec): Rust owns the
ADB process lifecycle, structured parsing, SQLite history, and audit log.
TypeScript is presentation + IPC. Strong typing end-to-end — Rust structs
serialize to a discriminated-union `AdbError` and typed payload shapes that
the frontend imports as hand-written bindings under `src/bindings/`.

See [docs/architecture.md](docs/architecture.md) for the full module layout,
IPC design, and data flow diagrams.

---

## Install

### End users (Windows 10+)

1. Download the latest `.msi` or `.exe` from the
   [GitHub Releases](../../releases) page.
2. Run the installer. Because the MVP installer is **not code-signed**,
   Windows SmartScreen will show a warning — click **More info → Run anyway**.
3. Install Android Platform Tools separately
   ([developer.android.com/studio/releases/platform-tools](https://developer.android.com/studio/releases/platform-tools))
   and ensure `adb.exe` is on your `PATH`, **or** set a custom adb path in
   *Settings → ADB* after launching the app.

> **Note on adb:** ADB Buddy does not bundle `adb.exe` in the installer.
> It auto-detects adb from `PATH` on first launch. You can override the path
> in Settings at any time.

### Developers (macOS or Windows)

See [docs/architecture.md](docs/architecture.md) for full module structure.

#### Prerequisites

- Node.js 20.19+ (or 22.13+/24+) and npm 11+
- Rust 1.77+ (install via [rustup](https://rustup.rs/))
- For Windows builds: Windows 10/11 with Visual Studio C++ Build Tools

#### Setup

```bash
git clone <this-repo>
cd "ADB GUI"

# Install frontend dependencies
npm install

# Run the full Tauri app (Rust + React together)
npm run tauri:dev

# Or run the frontend standalone with a mock IPC layer
# (no Rust backend required; canned data, useful for UI iteration)
npm run dev
```

#### macOS dev notes

`npm run tauri:dev` builds the Rust backend on macOS and launches the app,
but actual adb commands will fail with `AdbError::AdbNotFound` since there
is no `adb.exe` on macOS. This is expected — the frontend handles it
gracefully, so all error states, empty states, and UI flows are
exercisable on macOS without a real device.

For UI-only iteration, `npm run dev` (Vite) runs the frontend standalone
with a mock IPC layer that returns canned `Device` / `Package` /
`CmdResult` data — no Rust backend required.

Cross-compile to Windows is **not** configured in MVP. Use the GitHub
Actions CI workflow (`.github/workflows/build-windows.yml`) or a Windows
VM to produce Windows installers.

---

## Build

### Frontend only

```bash
npm run build      # tsc -b && vite build → dist/
npm run typecheck  # tsc --noEmit
```

### Tauri Windows installer (on Windows)

```bash
npm run tauri:build
# → src-tauri/target/release/bundle/msi/ADB Buddy_0.1.1_x64_en-US.msi
# → src-tauri/target/release/bundle/nsis/ADB Buddy_0.1.1_x64-setup.exe
```

Releases are produced automatically by CI when a `v*` tag is pushed —
see [`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml).

---

## Test

```bash
# Rust unit + integration tests (51 tests)
cd src-tauri && cargo test

# Frontend Vitest tests (28 tests)
npm test

# Both
npm run typecheck && (cd src-tauri && cargo check) && npm test && (cd src-tauri && cargo test)
```

Test coverage:

- **Rust parsers** — `adb devices -l`, `pm list packages`, `getprop`,
  `dumpsys battery`, `adb install` failure codes — all tested against
  captured fixtures in `tests/fixtures/`.
- **Rust history store** — round-trip insert + query + clear against
  in-memory SQLite.
- **Rust process manager** — register/kill against real subprocesses.
- **Rust file delete validation** — allow/deny for `/sdcard/` and
  `/data/local/tmp/` paths, including `..` traversal escape tests.
- **Frontend `lib/errors.ts`** — `explainError` for each of the 14
  `AdbError` variants.
- **Frontend `store/devices.ts`** — store reducer logic with mocked IPC.

Manual test matrix (not automated):

| Device | States to verify |
|---|---|
| Google Pixel | device / unauthorized / offline |
| Samsung Galaxy | device / unauthorized |
| Android emulator | device / offline / boot |
| Multiple devices | picker dialog appears |
| No devices | "Connect a device" empty state |

---

## Project layout

```
ADB GUI/
├── src/                     # React frontend
│   ├── bindings/            # hand-written TS types matching Rust
│   ├── ipc/                # typed invoke wrappers + mock layer
│   ├── store/               # Zustand stores
│   ├── components/          # layout, shared
│   ├── features/            # one folder per route
│   └── lib/                 # errors, format
├── src-tauri/               # Rust backend
│   └── src/
│       ├── adb/             # core ADB abstraction + parsers
│       ├── commands/        # #[tauri::command] handlers (38 commands)
│       ├── process/         # long-running process registry
│       ├── history/         # SQLite-backed command history
│       ├── audit/           # audit log
│       ├── settings/        # app settings
│       └── error.rs         # AdbError enum
├── tests/                   # Rust integration tests + fixtures
└── docs/
    ├── architecture.md
    ├── commands-reference.md
    ├── safety.md
    └── troubleshooting.md
```

See [docs/architecture.md](docs/architecture.md) for the full tree with
per-file responsibilities.

---

## Safety

Every destructive operation requires an explicit confirmation dialog that
shows the exact ADB command to be executed. See [docs/safety.md](docs/safety.md)
for the full list, including:

- Uninstall / clear data / force stop
- Disable system app
- Install with `-r -d` (downgrade)
- File delete (`adb shell rm`)
- Screenshot overwrite

---

## Troubleshooting

Common errors and their fixes are documented at
[docs/troubleshooting.md](docs/troubleshooting.md). The same content is
surfaced in-app via the `explainError()` function — every `AdbError` variant
maps to a human-readable title, suggested fix, and (where relevant) the
raw command that failed.

---

## License

MIT. See [LICENSE](LICENSE).

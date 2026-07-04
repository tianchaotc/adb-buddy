# Troubleshooting

Common errors and their fixes. These mirror the `AdbError` enum variants in
`src-tauri/src/error.rs` and the `explainError()` function in
`src/lib/errors.ts`.

---

## adb not found

**Symptom:** `AdbError::AdbNotFound { searched_paths }`

**Cause:** `adb.exe` is not on `PATH` and no custom adb path is set.

**Fix:**

1. Install Android Platform Tools:
   [developer.android.com/studio/releases/platform-tools](https://developer.android.com/studio/releases/platform-tools)
2. Add the platform-tools directory to your system `PATH`, **or**
3. In ADB Buddy: open **Settings → ADB**, toggle "Use custom adb path", and
   point it at `adb.exe`.

---

## Device unauthorized

**Symptom:** `AdbError::DeviceUnauthorized { serial }`

**Cause:** The device has not accepted the RSA debugging prompt. This happens
on first connection or after the authorization expired.

**Fix:**

1. Unlock the device screen.
2. Replug the USB cable.
3. Accept the "Allow USB debugging?" RSA prompt on the device.
4. If the prompt doesn't appear, toggle USB debugging off/on in
   Developer Options.
5. As a last resort: `adb kill-server && adb start-server` (button in the
   top bar) and replug again.

---

## Device offline

**Symptom:** `AdbError::DeviceOffline { serial }`

**Cause:** The device is visible to adb but not responding. Usually a bad
cable, low-power USB port, or the device being asleep.

**Fix:**

1. Wake the device.
2. Try a different USB cable.
3. Try a different USB port (avoid hubs; plug directly into the PC).
4. Run **Reconnect** from the top bar (`adb reconnect`).
5. Run **Kill server** then **Start server** (`adb kill-server && adb start-server`).
6. Reboot the device.

---

## Multiple devices connected

**Symptom:** `AdbError::MultipleDevices { serials }`

**Cause:** More than one device is attached and no device is selected.

**Fix:** Pick a device from the dropdown in the top bar.

---

## No devices connected

**Symptom:** `AdbError::NoDevices`

**Cause:** `adb devices -l` returned an empty list.

**Fix:**

1. Plug in a device over USB.
2. Enable **USB debugging** in Developer Options.
3. Accept the RSA prompt.
4. Run **Refresh** (Ctrl+R) in the top bar.
5. If using an emulator: start it from Android Studio's Device Manager.
6. If connecting over TCP/IP: `adb connect <ip>:5555` (TCP/IP support is
   not in MVP — use a terminal for now).

---

## Command failed (non-zero exit)

**Symptom:** `AdbError::CommandFailed { cmd, exit_code, stderr }`

**Cause:** The adb command ran but returned a non-zero status.

**Fix:**

1. Read the `stderr` field shown in the console panel.
2. Copy the command with the copy button and run it in a terminal to
   reproduce.
3. Common causes:
   - `error: closed` — device disconnected mid-command. Refresh.
   - `error: device not found` — device detached. Refresh.
   - `error: insufficient permissions` — adb server needs elevation, or
     udev rules are missing (Linux).

---

## Command timed out

**Symptom:** `AdbError::CommandTimeout { cmd, timeout_ms }`

**Cause:** The command did not finish within the timeout.

**Fix:**

1. Try again — sometimes a slow device just needs a second attempt.
2. Reboot the device if it consistently times out.
3. For `adb logcat` — use the streaming logcat viewer instead of running
   `adb logcat -d` in the shell runner.

---

## Install failed

**Symptom:** `AdbError::InstallFailed { code, explanation }`

| Code | Fix |
|---|---|
| `INSTALL_FAILED_VERSION_DOWNGRADE` | Enable "Allow downgrade" in the install options, or uninstall the newer version first. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | The installed app has a different signature. Uninstall it first. |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | The APK doesn't include native libraries for the device's CPU ABI. Use a universal APK or an APK matching the device's ABI (visible on the Dashboard). |
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | Free up space on the device or clear the app's cache. |
| `INSTALL_PARSE_FAILED_NO_CERTIFICATES` | The APK is not signed. Sign it before installing. |
| `INSTALL_FAILED_ALREADY_EXISTS` | Use `-r` (reinstall) to preserve data, or uninstall first. |

---

## Parse failed

**Symptom:** `AdbError::ParseFailed { cmd, raw, reason }`

**Cause:** ADB Buddy could not parse the output of `cmd`. This is a bug.

**Fix:**

1. Copy the command and the raw output (shown in the console panel).
2. Open an issue at the project's issue tracker with both pieces.
3. As a workaround: run the command in a terminal.

---

## Process already running

**Symptom:** `AdbError::ProcessAlreadyRunning { session_id }`

**Cause:** Attempted to start a long-running process (logcat) with a session
ID that is already in use.

**Fix:** Stop the existing process first (click Stop in the logcat toolbar),
then start again. This should not normally happen — if it does, it's a bug.

---

## History database error

**Symptom:** `AdbError::HistoryDbError { message }`

**Cause:** SQLite could not read or write the history database at
`%LOCALAPPDATA%/adb-buddy/history.db`.

**Fix:**

1. Check disk space.
2. Check file permissions on the data directory.
3. As a last resort: delete `history.db` — you will lose command history
   but the app will recreate it on next launch.

---

## SmartScreen warning on install (Windows)

**Cause:** The MVP installer is not code-signed.

**Fix:** Click **More info → Run anyway**. This is expected for MVP; code
signing is a post-MVP goal.

---

## App crashes or hangs

1. Check the logs: `%LOCALAPPDATA%/adb-buddy/app.log` (if file logging is
   enabled) or run from a terminal to see stderr.
2. Check the console panel for the last command that ran.
3. If the logcat viewer freezes: stop logcat, reduce the filter scope, and
   restart.
4. File an issue with: OS version, ADB Buddy version, adb version, device
   model, and steps to reproduce.

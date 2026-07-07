# Commands Reference

Every GUI action in ADB Buddy maps to an auditable ADB command. This document
lists each mapping. All commands are logged to the SQLite history with
timestamp, device serial, feature module, exit code, duration, stdout, and
stderr.

---

## Device management

| UI action | Command |
|---|---|
| Refresh devices | `adb devices -l` |
| Kill adb server | `adb kill-server` |
| Start adb server | `adb start-server` |
| Reconnect device | `adb reconnect` |
| Reconnect offline | `adb reconnect offline` |

---

## Dashboard

`get_device_overview` runs these in parallel and aggregates the result:

| Field | Command |
|---|---|
| Model, brand, manufacturer, Android version, SDK, build, ABI, security patch | `adb shell getprop` |
| Screen resolution | `adb shell wm size` |
| Screen density | `adb shell wm density` |
| Battery | `adb shell dumpsys battery` |
| SELinux status | `adb shell getenforce` |
| Root status | `adb shell id` (look for `uid=0`) |

---

## Apps / Packages

| UI action | Command |
|---|---|
| List all packages | `adb shell pm list packages` |
| List third-party packages | `adb shell pm list packages -3` |
| List system packages | `adb shell pm list packages -s` |
| List disabled packages | `adb shell pm list packages -d` |
| Get package details | `adb shell dumpsys package <package>` |
| Force stop | `adb shell am force-stop <package>` |
| Clear data ⚠️ | `adb shell pm clear <package>` |
| Disable (user 0) ⚠️ | `adb shell pm disable-user --user 0 <package>` |
| Enable | `adb shell pm enable <package>` |
| Uninstall ⚠️ | `adb shell pm uninstall <package>` |
| Uninstall for user 0 ⚠️ | `adb shell pm uninstall --user 0 <package>` |
| Pull APK | `adb shell pm path <package>` → `adb pull <apk_path>` |
| Launch app | `adb shell monkey -p <package> 1` |
| Open app settings | `adb shell am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:<package>` |

⚠️ = destructive, requires confirmation.

---

## Install / Uninstall

| UI action | Command |
|---|---|
| Install | `adb install <apk>` |
| Reinstall (preserve data) | `adb install -r <apk>` |
| Reinstall + downgrade ⚠️ | `adb install -r -d <apk>` |
| Grant all runtime permissions | `adb install -g <apk>` |
| Install split APKs | `adb install-multiple <apk1> <apk2> ...` |

⚠️ Downgrade requires confirmation.

### Common install errors (explained in-app)

| Code | Meaning |
|---|---|
| `INSTALL_FAILED_VERSION_DOWNGRADE` | A higher version is already installed. Enable "Allow downgrade" or uninstall first. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Existing app has a different signature. Uninstall it first. |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | APK doesn't include native libs for the device's CPU ABI. |
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | Device is out of storage. |
| `INSTALL_PARSE_FAILED_NO_CERTIFICATES` | APK is unsigned. Re-sign before installing. |

---

## Logs

| UI action | Command |
|---|---|
| Start logcat (streaming) | `adb logcat [filter_spec]` |
| Clear logcat buffer | `adb logcat -c` |

The streaming process is registered in the `ProcessRegistry` and killed on
stop or window close.

---

## Shell

| UI action | Command |
|---|---|
| Run shell command | `adb shell <command>` |

### Presets

| Label | Command |
|---|---|
| Properties | `getprop` |
| Activity stack | `dumpsys activity` |
| Window state | `dumpsys window` |
| Package info | `dumpsys package` |
| Battery info | `dumpsys battery` |
| Doze state | `dumpsys deviceidle` |
| Global settings | `settings list global` |
| Secure settings | `settings list secure` |
| System settings | `settings list system` |

---

## Screenshot

| UI action | Command |
|---|---|
| Capture screenshot | `adb shell screencap -p /sdcard/adb-buddy-screenshot.png` |
| Pull screenshot | `adb pull /sdcard/adb-buddy-screenshot.png <local>` |

---

## Settings

| UI action | Command |
|---|---|
| Validate adb | `adb version` |
| Get adb path | (resolved internally; no adb call) |
| Set adb path | (persisted to settings.json; no adb call) |

---

## History

| UI action | Command |
|---|---|
| Re-run history entry | Re-executes the original command |
| Export history (JSON) | (no adb call — reads from SQLite) |
| Clear history | (no adb call — deletes from SQLite) |

---

## Fastboot (not in MVP)

Listed for reference. Deferred per spec §2.9.

| UI action | Command |
|---|---|
| Detect fastboot devices | `fastboot devices` |
| Get device info | `fastboot getvar all` |
| Reboot to system | `fastboot reboot` |
| Reboot to bootloader | `fastboot reboot bootloader` |
| Flash partition ⚠️ | `fastboot flash <partition> <image>` |

⚠️ Flash operations require strong confirmation and are not in MVP.

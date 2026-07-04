# Safety

ADB Buddy never hides destructive commands. Every operation that can lose
data or brick a device requires an explicit confirmation dialog that shows:

- A clear title ("Clear app data?")
- A plain-language description of the consequences
- The exact ADB command to be executed
- A destructive-styled confirm button

---

## Confirmation required (MVP)

| Operation | Command | Risk |
|---|---|---|
| Uninstall package | `adb shell pm uninstall <package>` | Removes the app from the device. |
| Uninstall for user 0 | `adb shell pm uninstall --user 0 <package>` | Removes for user 0 only; APK still on device. |
| Clear app data | `adb shell pm clear <package>` | Wipes all user data for the app. |
| Force stop | `adb shell am force-stop <package>` | Stops the app immediately; unsaved state lost. |
| Disable system app | `adb shell pm disable-user --user 0 <package>` | Can break OS features depending on the app. |
| Install with downgrade | `adb install -r -d <apk>` | Replaces newer with older version; data may be incompatible. |
| File delete | `adb shell rm <path>` | Permanent deletion. No trash bin on Android. |
| Screenshot overwrite | (when destination file exists) | Overwrites local file. |

---

## Future destructive operations (not in MVP, listed for reference)

These will require confirmation when implemented:

- `fastboot flash <partition> <image>` — **strong** confirmation. Flashing
  the wrong image can brick the device.
- `adb shell dumpsys batterystats --reset` — wipes battery stats.
- `adb shell wm size <W>x<H>` / `adb shell wm density <dpi>` — changes
  display resolution/density.
- `adb shell settings put/delete` — modifies Android settings.
- `adb shell input` — simulates user input.
- `adb tcpip 5555` — switches ADB to TCP/IP (security risk on untrusted networks).

---

## Defensive design principles

1. **Never auto-run destructive commands.** No "Apply All" or batch destructive
   actions in MVP.
2. **Show the exact command.** The confirmation dialog displays the literal
   `adb ...` string that will run.
3. **Default to safe options.** Install flags default to off; the downgrade
   checkbox is unchecked.
4. **Multi-device awareness.** Operations target the selected serial. If no
   serial is selected and multiple devices are attached, the command fails
   with `AdbError::MultipleDevices` rather than running against an arbitrary
   device.
5. **Audit every command.** Every ADB invocation — successful or not — is
   written to the SQLite history with the full command, exit code, duration,
   stdout, and stderr.
6. **Warn on protected paths.** Browsing `/data/local/tmp/` or
   `/sdcard/Android/data/` shows a non-blocking warning that these paths
   have restricted access on modern Android.

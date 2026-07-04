//! Package management commands.
//!
//! Maps to: `pm list packages`, `dumpsys package`, `pm uninstall`, `pm clear`,
//! `am force-stop`, `pm disable`/`pm enable`, `pm path`, `monkey -p`, `am start`.

use std::sync::Arc;
use std::time::Duration;

use tauri::State;

use crate::adb::models::{Package, PackageDetails, PackageFilter};
use crate::adb::parser::packages;
use crate::audit;
use crate::commands::devices::run_simple;
use crate::commands::{history_ref, runner_from_settings};
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::settings::AppSettings;

/// `pm list packages [-3 | -s | -d]`
#[tauri::command]
pub async fn list_packages(
    serial: Option<String>,
    filter: PackageFilter,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<Vec<Package>, AdbError> {
    let runner = runner_from_settings(&settings)?;
    let mut args = vec!["shell".into(), "pm".into(), "list".into(), "packages".into()];
    match filter {
        PackageFilter::All => {}
        PackageFilter::ThirdParty => args.push("-3".into()),
        PackageFilter::System => args.push("-s".into()),
        PackageFilter::Disabled => args.push("-d".into()),
    }

    let result = runner.run(args, serial.clone(), None).await?;
    audit::log(
        Some(&history_ref(&history)),
        &result.command,
        Some(result.exit_code),
        result.duration_ms,
        serial.as_deref(),
        "packages",
        &result.stdout,
        &result.stderr,
    )
    .await;
    if result.exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: result.command,
            exit_code: result.exit_code,
            stderr: result.stderr,
        });
    }
    packages::parse_packages(&result.stdout, &filter)
}

/// `dumpsys package <package>` parsed into a [`PackageDetails`].
#[tauri::command]
pub async fn get_package_details(
    serial: Option<String>,
    package: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<PackageDetails, AdbError> {
    let runner = runner_from_settings(&settings)?;
    let result = runner
        .run(
            vec![
                "shell".into(),
                "dumpsys".into(),
                "package".into(),
                package.clone(),
            ],
            serial.clone(),
            Some(Duration::from_secs(20)),
        )
        .await?;
    audit::log(
        Some(&history_ref(&history)),
        &result.command,
        Some(result.exit_code),
        result.duration_ms,
        serial.as_deref(),
        "packages",
        &result.stdout,
        &result.stderr,
    )
    .await;
    if result.exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: result.command,
            exit_code: result.exit_code,
            stderr: result.stderr,
        });
    }
    Ok(parse_package_details(&result.stdout, &package))
}

/// `pm uninstall [-k|--user] <package>`
#[tauri::command]
pub async fn uninstall_package(
    serial: Option<String>,
    package: String,
    for_user: bool,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    let mut args = vec!["shell".into(), "pm".into(), "uninstall".into()];
    if for_user {
        args.push("--user".into());
        args.push("0".into());
    }
    args.push(package);
    run_simple(&settings, &history, args, serial, "packages").await
}

/// `pm clear <package>` — wipes app data.
#[tauri::command]
pub async fn clear_package_data(
    serial: Option<String>,
    package: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(
        &settings,
        &history,
        vec![
            "shell".into(),
            "pm".into(),
            "clear".into(),
            package,
        ],
        serial,
        "packages",
    )
    .await
}

/// `am force-stop <package>`
#[tauri::command]
pub async fn force_stop_package(
    serial: Option<String>,
    package: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(
        &settings,
        &history,
        vec![
            "shell".into(),
            "am".into(),
            "force-stop".into(),
            package,
        ],
        serial,
        "packages",
    )
    .await
}

/// `pm disable <package>` (or `pm disable-user`).
#[tauri::command]
pub async fn disable_package(
    serial: Option<String>,
    package: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(
        &settings,
        &history,
        vec![
            "shell".into(),
            "pm".into(),
            "disable-user".into(),
            "--user".into(),
            "0".into(),
            package,
        ],
        serial,
        "packages",
    )
    .await
}

/// `pm enable <package>`
#[tauri::command]
pub async fn enable_package(
    serial: Option<String>,
    package: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(
        &settings,
        &history,
        vec![
            "shell".into(),
            "pm".into(),
            "enable".into(),
            package,
        ],
        serial,
        "packages",
    )
    .await
}

/// `pm path <package>` then `adb pull` — saves the APK to `dest_dir`.
///
/// Returns the local path where the APK was saved.
#[tauri::command]
pub async fn pull_apk(
    serial: Option<String>,
    package: String,
    dest_dir: Option<String>,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<String, AdbError> {
    let runner = runner_from_settings(&settings)?;
    let path_result = runner
        .run(
            vec![
                "shell".into(),
                "pm".into(),
                "path".into(),
                package.clone(),
            ],
            serial.clone(),
            None,
        )
        .await?;
    audit::log(
        Some(&history_ref(&history)),
        &path_result.command,
        Some(path_result.exit_code),
        path_result.duration_ms,
        serial.as_deref(),
        "packages",
        &path_result.stdout,
        &path_result.stderr,
    )
    .await;
    if path_result.exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: path_result.command,
            exit_code: path_result.exit_code,
            stderr: path_result.stderr,
        });
    }
    // Output looks like `package:/data/app/.../base.apk`.
    let mut remote_apks: Vec<String> = Vec::new();
    for line in path_result.stdout.lines() {
        if let Some(rest) = line.strip_prefix("package:") {
            let rest = rest.trim();
            if !rest.is_empty() {
                remote_apks.push(rest.to_string());
            }
        }
    }
    if remote_apks.is_empty() {
        return Err(AdbError::ParseFailed {
            cmd: "pm path".into(),
            raw: path_result.stdout,
            reason: format!("no apk paths for {}", package),
        });
    }
    let dest = dest_dir.unwrap_or_else(default_download_dir);
    std::fs::create_dir_all(&dest)?;
    let mut last_saved = String::new();
    for (i, remote) in remote_apks.iter().enumerate() {
        let suffix = if remote_apks.len() == 1 {
            ".apk".to_string()
        } else {
            format!("_{}.apk", i)
        };
        let local_path = std::path::PathBuf::from(&dest)
            .join(format!("{}{}", package, suffix))
            .to_string_lossy()
            .into_owned();
        let pull_result = runner
            .run(
                vec!["pull".into(), remote.clone(), local_path.clone()],
                serial.clone(),
                None,
            )
            .await?;
        audit::log(
            Some(&history_ref(&history)),
            &pull_result.command,
            Some(pull_result.exit_code),
            pull_result.duration_ms,
            serial.as_deref(),
            "packages",
            &pull_result.stdout,
            &pull_result.stderr,
        )
        .await;
        if pull_result.exit_code != 0 {
            return Err(AdbError::CommandFailed {
                cmd: pull_result.command,
                exit_code: pull_result.exit_code,
                stderr: pull_result.stderr,
            });
        }
        last_saved = local_path;
    }
    Ok(last_saved)
}

/// `monkey -p <package> -c android.intent.category.LAUNCHER 1`
#[tauri::command]
pub async fn launch_package(
    serial: Option<String>,
    package: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(
        &settings,
        &history,
        vec![
            "shell".into(),
            "monkey".into(),
            "-p".into(),
            package,
            "-c".into(),
            "android.intent.category.LAUNCHER".into(),
            "1".into(),
        ],
        serial,
        "packages",
    )
    .await
}

/// `am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:<package>`
#[tauri::command]
pub async fn open_app_settings(
    serial: Option<String>,
    package: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    let data = format!("package:{}", package);
    run_simple(
        &settings,
        &history,
        vec![
            "shell".into(),
            "am".into(),
            "start".into(),
            "-a".into(),
            "android.settings.APPLICATION_DETAILS_SETTINGS".into(),
            "-d".into(),
            data,
        ],
        serial,
        "packages",
    )
    .await
}

/// Default download directory (used when `dest_dir` is None for `pull_apk`).
pub(crate) fn default_download_dir() -> String {
    directories::UserDirs::new()
        .and_then(|d| d.download_dir().map(|d| d.to_path_buf()))
        .or_else(|| {
            directories::ProjectDirs::from("com", "adbbuddy", "ADB Buddy")
                .map(|p| p.data_dir().to_path_buf())
        })
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| ".".to_string())
}

/// Parse `dumpsys package <name>` output for the most useful fields.
///
/// This is intentionally minimal — MVP only surfaces version, apk path, and
/// enabled/system flags.
fn parse_package_details(raw: &str, name: &str) -> PackageDetails {
    let mut details = PackageDetails {
        name: name.to_string(),
        ..Default::default()
    };
    let mut seen_system = false;
    let mut seen_enabled = false;

    for line in raw.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("versionName=") {
            details.version_name = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("versionCode=") {
            // Sometimes versionCode is `1 minSdk=...`
            let v = rest.split_whitespace().next().unwrap_or("");
            details.version_code = v.parse().ok();
        } else if let Some(rest) = line.strip_prefix("applicationInfo=") {
            // Looks like `ApplicationInfo{... flags=...}`
            if rest.contains("FLAG_SYSTEM") {
                seen_system = true;
                details.is_system = true;
            }
            if rest.contains("enabled=true") || rest.contains("flags=0x") {
                seen_enabled = true;
            }
        } else if let Some(rest) = line.strip_prefix("codePath=") {
            details.apk_path = Some(rest.trim().to_string());
        } else if line.starts_with("targetSdk=") {
            details.target_sdk = line
                .split('=')
                .nth(1)
                .and_then(|s| s.split_whitespace().next())
                .and_then(|s| s.parse().ok());
        } else if line.starts_with("pkgFlags=") {
            if line.contains("SYSTEM") {
                seen_system = true;
                details.is_system = true;
            }
        } else if line.starts_with("enabled=") {
            let v = line.split('=').nth(1).unwrap_or("").trim();
            match v {
                "true" | "1" | "DEFAULT" => {
                    details.is_enabled = true;
                    seen_enabled = true;
                }
                "false" | "0" | "DISABLED" => {
                    details.is_enabled = false;
                    seen_enabled = true;
                }
                _ => {}
            }
        }
    }
    if !seen_enabled {
        details.is_enabled = true; // optimistic default
    }
    if !seen_system {
        details.is_system = false;
    }
    details
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_package_details_minimal() {
        let raw = "Package [com.example] (id=1)\n  versionName=1.2.3\n  versionCode=123\n  codePath=/data/app/com.example-1/base.apk\n  enabled=true\n";
        let d = parse_package_details(raw, "com.example");
        assert_eq!(d.name, "com.example");
        assert_eq!(d.version_name.as_deref(), Some("1.2.3"));
        assert_eq!(d.version_code, Some(123));
        assert_eq!(
            d.apk_path.as_deref(),
            Some("/data/app/com.example-1/base.apk")
        );
        assert!(d.is_enabled);
    }
}

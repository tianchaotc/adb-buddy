//! APK install command.
//!
//! For MVP, `install_apk` runs synchronously: spawn `adb install` (or
//! `install-multiple` for split APKs), wait for it to finish, parse the
//! result, audit, and return.
//!
//! `cancel_install` is registered but is effectively a no-op for synchronous
//! installs — it exists so the frontend can call it without a 404.

use std::sync::Arc;
use std::time::Duration;

use tauri::State;

use crate::adb::models::{InstallFlags, InstallResult};
use crate::adb::parser::install::parse_install_result;
use crate::audit;
use crate::commands::{history_ref, runner_from_settings};
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::settings::AppSettings;

/// `adb install [flags] <apks>` or `adb install-multiple ...` for split APKs.
#[tauri::command]
pub async fn install_apk(
    serial: Option<String>,
    apk_paths: Vec<String>,
    flags: InstallFlags,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<InstallResult, AdbError> {
    if apk_paths.is_empty() {
        return Err(AdbError::InvalidInput {
            field: "apk_paths".into(),
            reason: "at least one APK path is required".into(),
        });
    }
    let runner = runner_from_settings(&settings)?;

    // Build the arg vector: `install [flags] <apks>` or `install-multiple [flags] <apks>`.
    let sub = if flags.multiple {
        "install-multiple"
    } else {
        "install"
    };
    let mut args = vec![sub.to_string()];
    args.extend(flags.to_args());
    args.extend(apk_paths.clone());

    // Install can take a while; allow up to 5 minutes.
    let result = runner
        .run(args, serial.clone(), Some(Duration::from_secs(300)))
        .await?;

    audit::log(
        Some(&history_ref(&history)),
        &result.command,
        Some(result.exit_code),
        result.duration_ms,
        serial.as_deref(),
        "install",
        &result.stdout,
        &result.stderr,
    )
    .await;

    parse_install_result(result.stdout, result.stderr, result.exit_code)
}

/// Cancel an in-flight install by session id.
///
/// For MVP installs are synchronous, so this simply returns Ok(()). The
/// signature is reserved for a future streaming implementation.
#[tauri::command]
pub async fn cancel_install(session_id: String) -> Result<(), AdbError> {
    log::info!("cancel_install called for session {} (no-op for MVP)", session_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::adb::models::InstallFlags;

    #[test]
    fn install_flags_args() {
        let f = InstallFlags {
            reinstall: true,
            allow_downgrade: true,
            grant_permissions: false,
            multiple: false,
        };
        assert_eq!(f.to_args(), vec!["-r".to_string(), "-d".to_string()]);
    }

    #[test]
    fn install_flags_empty_when_all_false() {
        let f = InstallFlags::default();
        assert!(f.to_args().is_empty());
    }
}

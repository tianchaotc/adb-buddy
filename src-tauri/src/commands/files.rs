//! File browser commands.
//!
//! MVP scope: list/pull/push/delete on `/sdcard/` and `/data/local/tmp/`.

use std::sync::Arc;

use tauri::State;

use crate::adb::models::FileEntry;
use crate::audit;
use crate::commands::devices::run_simple;
use crate::commands::packages::default_download_dir;
use crate::commands::{history_ref, runner_from_settings};
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::settings::AppSettings;

/// `adb shell ls -la <path>` — parsed into [`FileEntry`] items.
#[tauri::command]
pub async fn list_files(
    serial: Option<String>,
    path: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<Vec<FileEntry>, AdbError> {
    let runner = runner_from_settings(&settings)?;
    let result = runner
        .run(
            vec![
                "shell".into(),
                "ls".into(),
                "-la".into(),
                path.clone(),
            ],
            serial.clone(),
            None,
        )
        .await?;
    audit::log(
        Some(&history_ref(&history)),
        &result.command,
        Some(result.exit_code),
        result.duration_ms,
        serial.as_deref(),
        "files",
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
    Ok(parse_ls_la(&result.stdout))
}

/// `adb pull <remote> <local>` → returns the local path.
///
/// When `local` is `None`, the file is saved to the user's Downloads
/// directory with the same basename as `remote`.
#[tauri::command]
pub async fn pull_file(
    serial: Option<String>,
    remote: String,
    local: Option<String>,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<String, AdbError> {
    let runner = runner_from_settings(&settings)?;
    let resolved_local = match local {
        Some(l) => l,
        None => {
            let basename = remote.rsplit('/').next().unwrap_or(&remote);
            let dir = default_download_dir();
            std::fs::create_dir_all(&dir)?;
            let mut path = std::path::PathBuf::from(&dir);
            path.push(basename);
            path.to_string_lossy().into_owned()
        }
    };
    let result = runner
        .run(
            vec![
                "pull".into(),
                remote.clone(),
                resolved_local.clone(),
            ],
            serial.clone(),
            None,
        )
        .await?;
    audit::log(
        Some(&history_ref(&history)),
        &result.command,
        Some(result.exit_code),
        result.duration_ms,
        serial.as_deref(),
        "files",
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
    Ok(resolved_local)
}

/// `adb push <local> <remote>`
#[tauri::command]
pub async fn push_file(
    serial: Option<String>,
    local: String,
    remote: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(
        &settings,
        &history,
        vec![
            "push".into(),
            local.clone(),
            remote,
        ],
        serial,
        "files",
    )
    .await
}

/// `adb shell rm -f <path>` — restricted to MVP-allowed paths.
///
/// Only `/sdcard/` (and its subpaths) and `/data/local/tmp/` (and its
/// subpaths) are permitted. Any other path is rejected with
/// `AdbError::InvalidInput` before the adb command is constructed.
#[tauri::command]
pub async fn delete_file(
    serial: Option<String>,
    path: String,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    validate_deletable_path(&path)?;
    run_simple(
        &settings,
        &history,
        vec!["shell".into(), "rm".into(), "-f".into(), path],
        serial,
        "files",
    )
    .await
}

/// Reject paths outside the MVP-allowed deletion scope.
///
/// Allowed prefixes: `/sdcard/`, `/data/local/tmp/`. We normalise the path
/// (collapse `..` segments) before checking so users can't escape via `..`.
fn validate_deletable_path(path: &str) -> Result<(), AdbError> {
    let normalised = normalise_remote_path(path);
    let allowed = ["/sdcard/", "/data/local/tmp/"];
    if !allowed.iter().any(|p| normalised.starts_with(p)) {
        return Err(AdbError::InvalidInput {
            field: "path".into(),
            reason: format!(
                "deletion is only allowed under /sdcard/ or /data/local/tmp/ (got {})",
                normalised
            ),
        });
    }
    Ok(())
}

/// Collapse `..` and `.` segments in an Android path. Does not touch the
/// filesystem, so it's safe to use for input validation.
fn normalise_remote_path(path: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    let mut result = String::with_capacity(path.len());
    for seg in out {
        result.push('/');
        result.push_str(seg);
    }
    if !result.starts_with('/') {
        result.insert(0, '/');
    }
    result
}

/// Parse output of `ls -la` on Android (toybox / busybox format).
///
/// Lines look like:
/// ```text
/// -rw-rw-r-- 1 root root 1234 Jul  4 10:00 file.txt
/// drwxrwxrwt 2 root root 4096 Jul  4 09:00 subdir
/// ```
pub(crate) fn parse_ls_la(raw: &str) -> Vec<FileEntry> {
    let mut entries = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("total ") {
            continue;
        }
        // First column is perms; need at least perms + 1 more column.
        let mut parts = line.split_whitespace();
        let Some(perms) = parts.next() else {
            continue;
        };
        // Skip link count, owner, group.
        let _ = parts.next();
        let _ = parts.next();
        let _ = parts.next();
        // Size.
        let Some(size_str) = parts.next() else {
            continue;
        };
        let size: u64 = size_str.parse().unwrap_or(0);
        // Date: typically "Mon DD HH:MM" or "YYYY-MM-DD HH:MM".
        let _month = parts.next();
        let _day = parts.next();
        let _time = parts.next();
        // The remainder is the file name.
        let rest: String = parts.collect::<Vec<_>>().join(" ");
        if rest.is_empty() {
            continue;
        }
        let is_dir = perms.starts_with('d');
        entries.push(FileEntry {
            name: rest,
            size,
            modified: String::new(), // MVP: don't parse date string
            is_dir,
            perms: perms.to_string(),
        });
    }
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ls_la_basic() {
        let raw = "total 8\n\
            drwxrwxrwx 2 root root 4096 Jul  4 10:00 subdir\n\
            -rw-rw-r-- 1 root root  123 Jul  4 10:00 file.txt\n";
        let entries = parse_ls_la(raw);
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "subdir");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].name, "file.txt");
        assert_eq!(entries[1].size, 123);
    }

    #[test]
    fn parse_ls_la_skips_total_line() {
        let raw = "total 0\n";
        let entries = parse_ls_la(raw);
        assert!(entries.is_empty());
    }

    #[test]
    fn validate_allows_sdcard_paths() {
        assert!(validate_deletable_path("/sdcard/foo.txt").is_ok());
        assert!(validate_deletable_path("/sdcard/Download/bar").is_ok());
    }

    #[test]
    fn validate_allows_data_local_tmp_paths() {
        assert!(validate_deletable_path("/data/local/tmp/x").is_ok());
    }

    #[test]
    fn validate_rejects_system_paths() {
        assert!(validate_deletable_path("/system/app/x").is_err());
        assert!(validate_deletable_path("/data/data/com.x/y").is_err());
        assert!(validate_deletable_path("/etc/hosts").is_err());
    }

    #[test]
    fn validate_rejects_traversal_escape() {
        // /sdcard/../system should normalise to /system and be rejected.
        assert!(validate_deletable_path("/sdcard/../system/x").is_err());
        assert!(validate_deletable_path("/data/local/tmp/../../tmp/x").is_err());
    }

    #[test]
    fn validate_rejects_root() {
        assert!(validate_deletable_path("/").is_err());
        assert!(validate_deletable_path("").is_err());
    }

    #[test]
    fn normalise_collapses_dotdot() {
        assert_eq!(normalise_remote_path("/sdcard/a/../b"), "/sdcard/b");
        assert_eq!(normalise_remote_path("/a/b/./c"), "/a/b/c");
        assert_eq!(normalise_remote_path("/sdcard/.."), "/");
    }
}

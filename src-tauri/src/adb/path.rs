//! Resolves the `adb` (and `fastboot`) binary path.
//!
//! Strategy:
//! 1. If a custom path is supplied (from settings), use it directly after a
//!    quick existence check.
//! 2. Otherwise, ask the [`which`] crate to walk PATH.
//!
//! On failure we return [`AdbError::AdbNotFound`] with the list of paths we
//! considered, so the frontend can show a helpful "install platform-tools"
//! message.

use std::path::PathBuf;

use crate::error::AdbError;

/// Resolve the `adb` binary.
///
/// `custom` is the user-configured path (from settings), if any.
pub fn resolve_adb(custom: &Option<String>) -> Result<PathBuf, AdbError> {
    resolve("adb", custom.as_deref())
}

/// Resolve the `fastboot` binary.
pub fn resolve_fastboot(custom: &Option<String>) -> Result<PathBuf, AdbError> {
    resolve("fastboot", custom.as_deref())
}

fn resolve(bin: &str, custom: Option<&str>) -> Result<PathBuf, AdbError> {
    let mut searched: Vec<String> = Vec::new();

    if let Some(path_str) = custom {
        let path = PathBuf::from(path_str);
        if path.is_file() {
            return Ok(path);
        }
        searched.push(path_str.to_string());
        return Err(AdbError::AdbNotFound { searched_paths: searched });
    }

    // Walk PATH via `which`.
    match which::which(bin) {
        Ok(p) => Ok(p),
        Err(_) => {
            // `which` doesn't expose the PATH it searched, so we just record
            // the binary name + common platform-tools locations for the error
            // message.
            if let Some(path_env) = std::env::var_os("PATH") {
                for dir in std::env::split_paths(&path_env) {
                    searched.push(dir.to_string_lossy().into_owned());
                }
            }
            if let Some(home) = std::env::var_os("HOME") {
                let home = PathBuf::from(home);
                searched.push(home.join("platform-tools").to_string_lossy().into_owned());
                searched.push(
                    home.join("Library/Android/sdk/platform-tools")
                        .to_string_lossy()
                        .into_owned(),
                );
                searched.push(
                    home.join("Android/Sdk/platform-tools")
                        .to_string_lossy()
                        .into_owned(),
                );
            }
            searched.push(format!("(binary `{}` not on PATH)", bin));
            Err(AdbError::AdbNotFound { searched_paths: searched })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_adb_with_bogus_custom_returns_not_found() {
        let err = resolve_adb(&Some("/definitely/not/here/adb".into())).unwrap_err();
        match err {
            AdbError::AdbNotFound { searched_paths } => {
                assert_eq!(searched_paths.len(), 1);
                assert!(searched_paths[0].contains("not/here"));
            }
            other => panic!("expected AdbNotFound, got {:?}", other),
        }
    }
}

//! Parses output of `adb install`.
//!
//! Sample:
//! ```text
//! Success
//! ```
//! or:
//! ```text
//! Failure [INSTALL_FAILED_VERSION_DOWNGRADE]
//! ```

use crate::adb::models::InstallResult;
use crate::error::AdbError;

/// Map a `pm install` / `adb install` invocation to an [`InstallResult`] or
/// an [`AdbError::InstallFailed`] with a human-readable explanation.
pub fn parse_install_result(
    stdout: String,
    _stderr: String,
    exit_code: i32,
) -> Result<InstallResult, AdbError> {
    // `adb install` prints `Success` or `Failure [CODE]` on stdout.
    let first_line = stdout.lines().next().unwrap_or("").trim().to_string();

    if exit_code == 0 && first_line == "Success" {
        return Ok(InstallResult {
            success: true,
            message: first_line,
            code: None,
        });
    }

    // Try to extract `Failure [CODE]`.
    if let Some(rest) = first_line.strip_prefix("Failure") {
        let rest = rest.trim();
        if let Some(code_with_brackets) = rest.strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
            let code = code_with_brackets.trim().to_string();
            let explanation = explanation_for(&code).to_string();
            return Err(AdbError::InstallFailed { code, explanation });
        }
        // `Failure` with no code — exit_code != 0 path below handles this.
    }

    // Non-zero exit code with no parseable Failure line: treat as a generic
    // command failure so the user sees stderr.
    if exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: "adb install".into(),
            exit_code,
            stderr: _stderr,
        });
    }

    // exit_code == 0 but no `Success` line — treat as success anyway.
    Ok(InstallResult {
        success: true,
        message: first_line,
        code: None,
    })
}

/// Human-readable explanation for an `INSTALL_FAILED_*` / `INSTALL_PARSE_FAILED_*` code.
///
/// Mirrors spec §3.5's table; unknown codes fall back to a generic message.
pub fn explanation_for(code: &str) -> &'static str {
    match code {
        "INSTALL_FAILED_VERSION_DOWNGRADE" => {
            "App already installed with a higher version. Enable \"Allow downgrade\" or uninstall first."
        }
        "INSTALL_FAILED_UPDATE_INCOMPATIBLE" => {
            "Existing app has a different signature. Uninstall it first."
        }
        "INSTALL_FAILED_NO_MATCHING_ABIS" => {
            "APK doesn't contain native libs for the device's CPU ABI. Use a universal APK."
        }
        "INSTALL_FAILED_INSUFFICIENT_STORAGE" => {
            "Device is out of storage. Free space or clear app cache."
        }
        "INSTALL_FAILED_ALREADY_EXISTS" => {
            "App already installed. Use the reinstall (-r) flag or uninstall first."
        }
        "INSTALL_FAILED_INVALID_APK" => {
            "The APK file is malformed or corrupt. Rebuild it."
        }
        "INSTALL_FAILED_OLDER_SDK" => {
            "App's minSdkVersion is higher than the device's Android version."
        }
        "INSTALL_FAILED_WRONG_INSTALLED_VERSION" => {
            "Existing app has an incompatible version code. Uninstall first."
        }
        "INSTALL_PARSE_FAILED_NO_CERTIFICATES" => {
            "APK is not signed. Re-sign it before installing."
        }
        "INSTALL_PARSE_FAILED_BAD_MANIFEST" => {
            "APK manifest is malformed. Rebuild the APK."
        }
        "INSTALL_PARSE_FAILED_UNEXPECTED_EXCEPTION" => {
            "Unexpected parser error. The APK may be corrupt."
        }
        "INSTALL_PARSE_FAILED_NOT_APK" => {
            "The supplied file is not a valid APK."
        }
        "INSTALL_FAILED_VERIFICATION_FAILURE" => {
            "APK verification failed. The signature may be invalid."
        }
        "INSTALL_FAILED_DEXOPT" => {
            "Failed to optimize dex. The APK may reference missing classes."
        }
        _ => "Install failed. See the Android documentation for this error code.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const INSTALL_FAILURE_DOWNGRADE: &str =
        include_str!("../../../../tests/fixtures/install_failure_downgrade.txt");

    #[test]
    fn parse_install_success() {
        let result =
            parse_install_result("Success\n".into(), "".into(), 0).expect("result");
        assert!(result.success);
        assert_eq!(result.message, "Success");
        assert_eq!(result.code, None);
    }

    #[test]
    fn parse_install_failure_downgrade() {
        let err = parse_install_result(
            INSTALL_FAILURE_DOWNGRADE.to_string(),
            "".into(),
            1,
        )
        .unwrap_err();
        match err {
            AdbError::InstallFailed { code, explanation } => {
                assert_eq!(code, "INSTALL_FAILED_VERSION_DOWNGRADE");
                assert!(explanation.contains("downgrade"));
            }
            other => panic!("expected InstallFailed, got {:?}", other),
        }
    }

    #[test]
    fn parse_install_failure_incompatible() {
        let raw = "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]\n";
        let err = parse_install_result(raw.into(), "".into(), 1).unwrap_err();
        match err {
            AdbError::InstallFailed { code, .. } => {
                assert_eq!(code, "INSTALL_FAILED_UPDATE_INCOMPATIBLE");
            }
            other => panic!("expected InstallFailed, got {:?}", other),
        }
    }

    #[test]
    fn parse_install_failure_unknown_code() {
        let raw = "Failure [INSTALL_FAILED_SOME_NEW_CODE]\n";
        let err = parse_install_result(raw.into(), "".into(), 1).unwrap_err();
        match err {
            AdbError::InstallFailed { code, explanation } => {
                assert_eq!(code, "INSTALL_FAILED_SOME_NEW_CODE");
                assert!(explanation.contains("Android documentation"));
            }
            other => panic!("expected InstallFailed, got {:?}", other),
        }
    }

    #[test]
    fn parse_install_generic_failure_returns_command_failed() {
        let err =
            parse_install_result("adb: unable to open".into(), "Permission denied".into(), 1)
                .unwrap_err();
        match err {
            AdbError::CommandFailed { exit_code, stderr, .. } => {
                assert_eq!(exit_code, 1);
                assert_eq!(stderr, "Permission denied");
            }
            other => panic!("expected CommandFailed, got {:?}", other),
        }
    }

    #[test]
    fn explanation_known_codes() {
        assert!(explanation_for("INSTALL_FAILED_NO_MATCHING_ABIS").contains("CPU ABI"));
        assert!(explanation_for("INSTALL_PARSE_FAILED_NO_CERTIFICATES").contains("signed"));
        // Unknown code should still produce something useful.
        assert!(!explanation_for("UNKNOWN_CODE").is_empty());
    }
}

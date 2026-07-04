//! Parses output of `pm list packages`.
//!
//! Format:
//! ```text
//! package:<name>
//! ```

use crate::adb::models::{Package, PackageFilter};
use crate::error::AdbError;

/// Parse `pm list packages` output.
///
/// The `filter` indicates which flag was used; we set the matching boolean on
/// every returned [`Package`].
pub fn parse_packages(raw: &str, filter: &PackageFilter) -> Result<Vec<Package>, AdbError> {
    let mut packages = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(name) = line.strip_prefix("package:") {
            let name = name.trim().to_string();
            if name.is_empty() {
                continue;
            }
            let pkg = match filter {
                PackageFilter::All => Package {
                    name,
                    is_system: false,
                    is_third_party: false,
                    is_disabled: false,
                },
                PackageFilter::ThirdParty => Package {
                    name,
                    is_system: false,
                    is_third_party: true,
                    is_disabled: false,
                },
                PackageFilter::System => Package {
                    name,
                    is_system: true,
                    is_third_party: false,
                    is_disabled: false,
                },
                PackageFilter::Disabled => Package {
                    name,
                    is_system: false,
                    is_third_party: false,
                    is_disabled: true,
                },
            };
            packages.push(pkg);
        }
    }
    Ok(packages)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PM_LIST: &str = include_str!("../../../../tests/fixtures/pm_list.txt");

    #[test]
    fn parse_third_party_packages() {
        let packages = parse_packages(PM_LIST, &PackageFilter::ThirdParty).expect("parse");
        assert_eq!(packages.len(), 10);
        // First one should be marked third-party.
        assert!(packages[0].is_third_party);
        assert!(!packages[0].is_system);
        assert!(!packages[0].is_disabled);
    }

    #[test]
    fn parse_system_filter_marks_system() {
        let packages = parse_packages(PM_LIST, &PackageFilter::System).expect("parse");
        assert!(packages.iter().all(|p| p.is_system));
    }

    #[test]
    fn parse_disabled_filter_marks_disabled() {
        let packages = parse_packages(PM_LIST, &PackageFilter::Disabled).expect("parse");
        assert!(packages.iter().all(|p| p.is_disabled));
    }

    #[test]
    fn parse_packages_empty_input() {
        let packages = parse_packages("", &PackageFilter::All).expect("parse");
        assert!(packages.is_empty());
    }

    #[test]
    fn parse_packages_skips_blank_lines() {
        let raw = "package:com.foo\n\n   \npackage:com.bar\n";
        let packages = parse_packages(raw, &PackageFilter::All).expect("parse");
        assert_eq!(packages.len(), 2);
        assert_eq!(packages[0].name, "com.foo");
        assert_eq!(packages[1].name, "com.bar");
    }
}

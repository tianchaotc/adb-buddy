//! Parses output of `getprop`.
//!
//! Format:
//! ```text
//! [ro.product.model]: [Pixel 7]
//! ```

use crate::error::AdbError;

/// Parse `getprop` output into a list of `(key, value)` pairs.
///
/// Lines that don't match the `[key]: [value]` pattern are silently skipped.
pub fn parse_getprop(raw: &str) -> Result<Vec<(String, String)>, AdbError> {
    let mut props = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // `[ro.product.model]: [Pixel 7]`
        if !line.starts_with('[') {
            continue;
        }
        // Find the closing bracket for the key.
        let Some(key_close) = line.find("]:") else {
            continue;
        };
        let key = line[1..key_close].to_string();
        let rest = &line[key_close + 2..];
        let rest = rest.trim_start();
        let value = if rest.starts_with('[') && rest.ends_with(']') && rest.len() >= 2 {
            rest[1..rest.len() - 1].to_string()
        } else {
            // Sometimes the value is empty: `[key]: []`
            rest.trim().to_string()
        };
        props.push((key, value));
    }
    Ok(props)
}

/// Look up a single property in a list parsed by [`parse_getprop`].
pub fn get(props: &[(String, String)], key: &str) -> Option<String> {
    props
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    const GETPROP: &str = include_str!("../../../../tests/fixtures/getprop.txt");

    #[test]
    fn parse_getprop_pixel7() {
        let props = parse_getprop(GETPROP).expect("parse");
        // At least 20 properties expected in the fixture.
        assert!(props.len() >= 20);
        assert_eq!(get(&props, "ro.product.model"), Some("Pixel 7".into()));
        assert_eq!(get(&props, "ro.product.brand"), Some("google".into()));
        assert_eq!(get(&props, "ro.build.version.release"), Some("13".into()));
        assert_eq!(get(&props, "ro.build.version.sdk"), Some("33".into()));
        assert_eq!(
            get(&props, "ro.build.fingerprint"),
            Some("google/panther/panther:13/TQ3A.230805.001/10316531:user/release-keys".into())
        );
    }

    #[test]
    fn parse_getprop_handles_empty_value() {
        let raw = "[ro.empty.prop]: []\n[ro.foo]: [bar]\n";
        let props = parse_getprop(raw).expect("parse");
        assert_eq!(props.len(), 2);
        assert_eq!(props[0].1, "");
        assert_eq!(props[1].1, "bar");
    }

    #[test]
    fn parse_getprop_skips_garbage_lines() {
        let raw = "garbage line\n[ro.foo]: [bar]\n# comment\n";
        let props = parse_getprop(raw).expect("parse");
        assert_eq!(props.len(), 1);
        assert_eq!(props[0], ("ro.foo".into(), "bar".into()));
    }
}

//! Parses output of `dumpsys battery`.
//!
//! Sample:
//! ```text
//! Current Battery Service state:
//!   AC powered: true
//!   USB powered: false
//!   Max charging current: 0
//!   status: 2
//!   health: 2
//!   level: 87
//!   temperature: 285
//!   voltage: 4123
//!   technology: Li-ion
//! ```

use crate::adb::models::BatteryInfo;
use crate::error::AdbError;

/// Parse `dumpsys battery` output.
pub fn parse_battery(raw: &str) -> Result<BatteryInfo, AdbError> {
    let mut info = BatteryInfo::default();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();

        match key {
            "level" => info.level = value.parse().ok(),
            "status" => info.status = value.parse().ok(),
            "powered" => info.powered = parse_bool(value),
            "AC powered" => info.ac_powered = parse_bool(value),
            "USB powered" => info.usb_powered = parse_bool(value),
            "temperature" => info.temperature = value.parse().ok(),
            "voltage" => info.voltage = value.parse().ok(),
            "technology" => info.technology = Some(value.to_string()),
            _ => {}
        }
    }
    Ok(info)
}

fn parse_bool(s: &str) -> Option<bool> {
    match s.to_ascii_lowercase().as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DUMPSYS_BATTERY: &str = include_str!("../../../../tests/fixtures/dumpsys_battery.txt");

    #[test]
    fn parse_battery_pixel7() {
        let info = parse_battery(DUMPSYS_BATTERY).expect("parse");
        assert_eq!(info.level, Some(87));
        assert_eq!(info.status, Some(2));
        assert_eq!(info.ac_powered, Some(true));
        assert_eq!(info.usb_powered, Some(false));
        assert_eq!(info.temperature, Some(285));
        assert_eq!(info.voltage, Some(4123));
        assert_eq!(info.technology.as_deref(), Some("Li-ion"));
    }

    #[test]
    fn parse_battery_handles_missing_fields() {
        let raw = "Current Battery Service state:\n  level: 50\n";
        let info = parse_battery(raw).expect("parse");
        assert_eq!(info.level, Some(50));
        assert_eq!(info.status, None);
    }

    #[test]
    fn parse_battery_empty_input() {
        let info = parse_battery("").expect("parse");
        assert_eq!(info.level, None);
    }
}

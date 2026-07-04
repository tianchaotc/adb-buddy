//! Parses output of `adb devices -l`.
//!
//! Format:
//! ```text
//! List of devices attached
//! <serial>    <state>  usb:<usb> model:<model> product:<product> transport_id:<id>
//! ...
//! ```

use crate::adb::models::{Device, DeviceState};
use crate::error::AdbError;

/// Parse `adb devices -l` (or `adb devices`) output.
pub fn parse_devices(raw: &str) -> Result<Vec<Device>, AdbError> {
    let mut devices = Vec::new();
    let mut saw_header = false;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if !saw_header {
            if line.starts_with("List of devices") {
                saw_header = true;
                continue;
            }
            // Some adb versions omit the header; tolerate.
        }
        if line.starts_with("List of devices") {
            saw_header = true;
            continue;
        }
        if line.starts_with('*') {
            // daemon startup banner, e.g. "* daemon not running; starting now..."
            continue;
        }

        let mut tokens = line.split_whitespace();
        let serial = match tokens.next() {
            Some(s) => s.to_string(),
            None => continue,
        };
        let state_str = match tokens.next() {
            Some(s) => s,
            None => {
                return Err(AdbError::ParseFailed {
                    cmd: "adb devices".into(),
                    raw: line.into(),
                    reason: "missing state field".into(),
                });
            }
        };
        let state = DeviceState::parse(state_str);

        let mut device = Device {
            serial,
            state,
            transport_id: None,
            usb: None,
            model: None,
            product: None,
            device: None,
        };

        for tok in tokens {
            if let Some(rest) = tok.strip_prefix("transport_id:") {
                device.transport_id = Some(rest.to_string());
            } else if let Some(rest) = tok.strip_prefix("usb:") {
                device.usb = Some(rest.to_string());
            } else if let Some(rest) = tok.strip_prefix("model:") {
                device.model = Some(rest.to_string());
            } else if let Some(rest) = tok.strip_prefix("product:") {
                device.product = Some(rest.to_string());
            } else if let Some(rest) = tok.strip_prefix("device:") {
                device.device = Some(rest.to_string());
            }
        }
        devices.push(device);
    }

    Ok(devices)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEVICES_L: &str = include_str!("../../../../tests/fixtures/devices_l.txt");

    #[test]
    fn parse_devices_l_valid() {
        let devices = parse_devices(DEVICES_L).expect("parse");
        assert_eq!(devices.len(), 3);
        let d0 = &devices[0];
        assert_eq!(d0.serial, "HA0XYY05");
        assert_eq!(d0.state, DeviceState::Device);
        assert_eq!(d0.model.as_deref(), Some("Pixel_7"));
        assert_eq!(d0.product.as_deref(), Some("panther"));
        assert_eq!(d0.transport_id.as_deref(), Some("1"));
        assert_eq!(d0.usb.as_deref(), Some("1-3"));
    }

    #[test]
    fn parse_devices_unauthorized() {
        let devices = parse_devices(DEVICES_L).expect("parse");
        let unauth = devices
            .iter()
            .find(|d| d.state == DeviceState::Unauthorized)
            .expect("unauthorized device");
        assert_eq!(unauth.serial, "emulator-5554");
    }

    #[test]
    fn parse_devices_offline() {
        let devices = parse_devices(DEVICES_L).expect("parse");
        let offline = devices
            .iter()
            .find(|d| d.state == DeviceState::Offline)
            .expect("offline device");
        assert_eq!(offline.serial, "172.16.10.20:5555");
    }

    #[test]
    fn parse_devices_handles_daemon_banner() {
        let raw = "* daemon not running; starting now at tcp:5037\n* daemon started successfully\nList of devices attached\nHA0XYY05  device  model:Pixel_7\n";
        let devices = parse_devices(raw).expect("parse");
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].serial, "HA0XYY05");
    }

    #[test]
    fn parse_devices_empty_when_no_header() {
        let raw = "";
        let devices = parse_devices(raw).expect("parse");
        assert!(devices.is_empty());
    }
}

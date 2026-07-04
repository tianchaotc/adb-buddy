//! Parsers for adb command outputs.
//!
//! Each submodule handles one adb output format. All parsers return
//! `Result<T, AdbError>` and are pure functions of their input, so they can be
//! unit-tested against fixture files without a real device.

pub mod battery;
pub mod devices;
pub mod getprop;
pub mod install;
pub mod packages;

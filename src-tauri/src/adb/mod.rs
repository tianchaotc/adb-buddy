//! Core ADB abstraction layer.
//!
//! - [`models`] — data types crossing the IPC boundary.
//! - [`path`] — resolves the `adb` / `fastboot` binary from PATH or settings.
//! - [`runner`] — spawns `adb` subprocesses, captures or streams output.
//! - [`parser`] — structured parsers for `adb devices`, `pm list packages`,
//!   `getprop`, `dumpsys battery`, and `adb install` results.

pub mod models;
pub mod parser;
pub mod path;
pub mod runner;

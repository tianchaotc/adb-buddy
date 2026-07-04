//! Long-running process registry.
//!
//! - [`manager`] — `ProcessRegistry` keeps track of spawned `tokio::process::Child`
//!   handles by session id (used by logcat and screenrecord).
//! - [`stream`] — line-buffered reader that emits each line to a callback.

pub mod manager;
pub mod stream;

pub use manager::ProcessRegistry;

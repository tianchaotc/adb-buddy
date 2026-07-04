//! SQLite-backed command history.
//!
//! - [`schema`] — SQL migration string.
//! - [`models`] — `HistoryEntry`, `HistoryFilter`.
//! - [`store`] — `HistoryStore` wrapper around `rusqlite::Connection`.

pub mod models;
pub mod schema;
pub mod store;

pub use models::{HistoryEntry, HistoryFilter};
pub use store::HistoryStore;

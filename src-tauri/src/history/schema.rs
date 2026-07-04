//! SQL schema for the `command_history` table.
//!
//! Applied once at startup by [`crate::history::store::HistoryStore::open`].

/// The migration applied at startup. Wrapping in `const` makes it easy to
/// inline in tests as well.
pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS command_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    device_serial TEXT NOT NULL,
    feature_module TEXT NOT NULL,
    command TEXT NOT NULL,
    exit_code INTEGER,
    duration_ms INTEGER NOT NULL,
    stdout TEXT,
    stderr TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON command_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_history_command ON command_history(command);
CREATE INDEX IF NOT EXISTS idx_history_module ON command_history(feature_module);
"#;

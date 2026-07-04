//! `HistoryStore` — wraps a `rusqlite::Connection` in a `tokio::sync::Mutex`
//! and provides insert/query/clear methods.
//!
//! Persisted at `<data_dir>/adb-buddy/history.db` (cross-platform via the
//! `directories` crate).

use std::sync::Arc;

use rusqlite::{params, Connection};
use tokio::sync::Mutex;

use crate::adb::models::{HistoryEntry, HistoryFilter};
use crate::error::AdbError;
use crate::history::schema::SCHEMA;

/// SQLite-backed history store.
pub struct HistoryStore {
    conn: Mutex<Connection>,
}

impl HistoryStore {
    /// Open (or create) the history DB at the platform data dir.
    pub fn open(path: &std::path::Path) -> Result<Arc<Self>, AdbError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        Ok(Arc::new(HistoryStore {
            conn: Mutex::new(conn),
        }))
    }

    /// Open the singleton DB at `<data_dir>/adb-buddy/history.db`.
    ///
    /// Falls back to a temp path if the data dir cannot be resolved (so tests
    /// and sandboxed runs still work).
    pub fn shared() -> Result<Arc<Self>, AdbError> {
        let path = history_db_path()?;
        Self::open(&path)
    }

    /// Open an in-memory database — useful for tests.
    pub fn in_memory() -> Result<Arc<Self>, AdbError> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA)?;
        Ok(Arc::new(HistoryStore {
            conn: Mutex::new(conn),
        }))
    }

    /// Insert a new entry, returning the assigned row id.
    pub async fn insert(&self, entry: HistoryEntry) -> Result<i64, AdbError> {
        let conn = self.conn.lock().await;
        conn.execute(
            "INSERT INTO command_history
                (timestamp, device_serial, feature_module, command, exit_code, duration_ms, stdout, stderr)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                entry.timestamp,
                entry.device_serial,
                entry.feature_module,
                entry.command,
                entry.exit_code,
                entry.duration_ms,
                entry.stdout,
                entry.stderr,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Query history with a filter. Returns entries in descending timestamp order.
    pub async fn query(&self, filter: &HistoryFilter) -> Result<Vec<HistoryEntry>, AdbError> {
        let conn = self.conn.lock().await;
        let mut sql = String::from(
            "SELECT id, timestamp, device_serial, feature_module, command, exit_code, duration_ms, stdout, stderr
             FROM command_history WHERE 1=1",
        );
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(s) = &filter.search {
            sql.push_str(" AND command LIKE ? COLLATE NOCASE");
            args.push(Box::new(format!("%{}%", s)));
        }
        if let Some(m) = &filter.module {
            sql.push_str(" AND feature_module = ?");
            args.push(Box::new(m.clone()));
        }
        if let Some(s) = &filter.serial {
            sql.push_str(" AND device_serial = ?");
            args.push(Box::new(s.clone()));
        }
        if let Some(since) = &filter.since {
            sql.push_str(" AND timestamp >= ?");
            args.push(Box::new(since.clone()));
        }
        if let Some(until) = &filter.until {
            sql.push_str(" AND timestamp <= ?");
            args.push(Box::new(until.clone()));
        }
        let limit = if filter.limit > 0 {
            filter.limit
        } else {
            100
        };
        sql.push_str(" ORDER BY timestamp DESC LIMIT ?");
        args.push(Box::new(limit));

        let params_ref: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_ref.as_slice(), row_to_entry)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Fetch a single entry by id.
    pub async fn get(&self, id: i64) -> Result<Option<HistoryEntry>, AdbError> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(
            "SELECT id, timestamp, device_serial, feature_module, command, exit_code, duration_ms, stdout, stderr
             FROM command_history WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_entry(row)?))
        } else {
            Ok(None)
        }
    }

    /// Clear history. If `before` is `Some`, only entries older than that ISO
    /// 8601 timestamp are removed; otherwise all entries are removed.
    pub async fn clear(&self, before: Option<&str>) -> Result<usize, AdbError> {
        let conn = self.conn.lock().await;
        let affected = match before {
            Some(ts) => conn.execute(
                "DELETE FROM command_history WHERE timestamp < ?1",
                params![ts],
            )?,
            None => conn.execute("DELETE FROM command_history", [])?,
        };
        Ok(affected)
    }
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryEntry> {
    Ok(HistoryEntry {
        id: Some(row.get::<_, i64>(0)?),
        timestamp: row.get(1)?,
        device_serial: row.get(2)?,
        feature_module: row.get(3)?,
        command: row.get(4)?,
        exit_code: row.get(5)?,
        duration_ms: row.get(6)?,
        stdout: row.get(7).unwrap_or_default(),
        stderr: row.get(8).unwrap_or_default(),
    })
}

/// Resolve the on-disk path for the history DB.
pub fn history_db_path() -> Result<std::path::PathBuf, AdbError> {
    let proj = directories::ProjectDirs::from("com", "adbbuddy", "ADB Buddy")
        .or_else(|| directories::ProjectDirs::from("com", "adbbuddy", "ADB-Buddy"))
        .ok_or_else(|| AdbError::HistoryDbError {
            message: "cannot resolve data dir".into(),
        })?;
    Ok(proj.data_dir().join("history.db"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_entry(command: &str, module: &str) -> HistoryEntry {
        HistoryEntry {
            id: None,
            timestamp: "2026-07-04T12:00:00Z".into(),
            device_serial: "HA0XYY05".into(),
            feature_module: module.into(),
            command: command.into(),
            exit_code: Some(0),
            duration_ms: 100,
            stdout: "out".into(),
            stderr: "".into(),
        }
    }

    #[tokio::test]
    async fn round_trip() {
        let store = HistoryStore::in_memory().expect("open");
        let id = store.insert(sample_entry("adb devices -l", "devices")).await.expect("insert");
        assert!(id > 0);
        let got = store.get(id).await.expect("get").expect("entry");
        assert_eq!(got.command, "adb devices -l");
        assert_eq!(got.feature_module, "devices");
    }

    #[tokio::test]
    async fn query_filters_by_module() {
        let store = HistoryStore::in_memory().expect("open");
        store
            .insert(sample_entry("adb devices", "devices"))
            .await
            .unwrap();
        store
            .insert(sample_entry("adb shell pm list packages", "packages"))
            .await
            .unwrap();
        let filter = HistoryFilter {
            module: Some("packages".into()),
            ..Default::default()
        };
        let results = store.query(&filter).await.expect("query");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].feature_module, "packages");
    }

    #[tokio::test]
    async fn query_search_by_command() {
        let store = HistoryStore::in_memory().expect("open");
        store
            .insert(sample_entry("adb devices", "devices"))
            .await
            .unwrap();
        store
            .insert(sample_entry("adb shell ls", "shell"))
            .await
            .unwrap();
        let filter = HistoryFilter {
            search: Some("ls".into()),
            ..Default::default()
        };
        let results = store.query(&filter).await.expect("query");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].command, "adb shell ls");
    }

    #[tokio::test]
    async fn clear_all() {
        let store = HistoryStore::in_memory().expect("open");
        store.insert(sample_entry("a", "m")).await.unwrap();
        store.insert(sample_entry("b", "m")).await.unwrap();
        let n = store.clear(None).await.expect("clear");
        assert_eq!(n, 2);
        let results = store
            .query(&HistoryFilter::default())
            .await
            .expect("query");
        assert!(results.is_empty());
    }
}

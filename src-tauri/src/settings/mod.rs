//! Persistent application settings.
//!
//! Stored as JSON at `<data_dir>/adb-buddy/settings.json`. Held in Tauri
//! state as `tauri::State<std::sync::Mutex<AppSettings>>`.

use serde::{Deserialize, Serialize};

use crate::error::AdbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// Custom adb path. `None` = auto-detect via PATH.
    #[serde(default)]
    pub adb_path: Option<String>,
    /// Custom fastboot path. `None` = auto-detect.
    #[serde(default)]
    pub fastboot_path: Option<String>,
    /// `"system"` (default), `"light"`, or `"dark"`.
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Days to retain command history entries. Default 30.
    #[serde(default = "default_retention")]
    pub history_retention_days: u32,
    /// User-saved shell favorites.
    #[serde(default)]
    pub shell_favorites: Vec<String>,
}

fn default_theme() -> String {
    "system".into()
}

fn default_retention() -> u32 {
    30
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            adb_path: None,
            fastboot_path: None,
            theme: default_theme(),
            history_retention_days: default_retention(),
            shell_favorites: Vec::new(),
        }
    }
}

impl AppSettings {
    /// Resolve the settings file path.
    pub fn settings_file_path() -> Result<std::path::PathBuf, AdbError> {
        let proj = directories::ProjectDirs::from("com", "adbbuddy", "ADB Buddy")
            .or_else(|| directories::ProjectDirs::from("com", "adbbuddy", "ADB-Buddy"))
            .ok_or_else(|| AdbError::IoError {
                message: "cannot resolve data dir".into(),
            })?;
        Ok(proj.data_dir().join("settings.json"))
    }

    /// Load settings from disk. Returns `Default` if the file doesn't exist.
    pub fn load() -> Result<Self, AdbError> {
        let path = Self::settings_file_path()?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let contents = std::fs::read_to_string(&path)?;
        let parsed: Self = serde_json::from_str(&contents)?;
        Ok(parsed)
    }

    /// Save settings to disk.
    pub fn save(&self) -> Result<(), AdbError> {
        let path = Self::settings_file_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, json)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_match_spec() {
        let s = AppSettings::default();
        assert_eq!(s.theme, "system");
        assert_eq!(s.history_retention_days, 30);
        assert!(s.shell_favorites.is_empty());
        assert!(s.adb_path.is_none());
    }

    #[test]
    fn round_trip_json() {
        let s = AppSettings {
            adb_path: Some("/custom/adb".into()),
            fastboot_path: None,
            theme: "dark".into(),
            history_retention_days: 60,
            shell_favorites: vec!["getprop".into()],
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.adb_path.as_deref(), Some("/custom/adb"));
        assert_eq!(back.theme, "dark");
        assert_eq!(back.history_retention_days, 60);
        assert_eq!(back.shell_favorites, vec!["getprop".to_string()]);
    }

    #[test]
    fn deserialize_with_missing_fields_uses_defaults() {
        let json = r#"{"adb_path":"/x/adb"}"#;
        let s: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(s.adb_path.as_deref(), Some("/x/adb"));
        assert_eq!(s.theme, "system"); // default applied
        assert_eq!(s.history_retention_days, 30);
    }
}

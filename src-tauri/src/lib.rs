//! ADB Buddy — Rust backend.
//!
//! Module layout mirrors the design spec at
//! `docs/superpowers/specs/2026-07-04-adb-buddy-mvp-design.md`.

pub mod adb;
pub mod audit;
pub mod commands;
pub mod error;
pub mod history;
pub mod process;
pub mod settings;

use settings::AppSettings;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_secs()
        .init();

    let settings = AppSettings::load().unwrap_or_default();
    let history = history::HistoryStore::shared().unwrap_or_else(|e| {
        log::error!("failed to open history DB, falling back to in-memory: {}", e);
        history::HistoryStore::in_memory().expect("in-memory history store")
    });

    tauri::Builder::default()
        .plugin(
            tauri_plugin_shell::init(),
        )
        .manage(std::sync::Mutex::new(settings))
        .manage(process::ProcessRegistry::new())
        .manage(history)
        .setup(|app| {
            log::info!("ADB Buddy starting up");
            let _: tauri::State<std::sync::Mutex<AppSettings>> = app.state();
            let _: tauri::State<process::ProcessRegistry> = app.state();
            let _: tauri::State<Arc<history::HistoryStore>> = app.state();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // devices
            commands::devices::list_devices,
            commands::devices::kill_server,
            commands::devices::start_server,
            commands::devices::reconnect_device,
            commands::devices::reconnect_offline,
            commands::devices::get_device_overview,
            // packages
            commands::packages::list_packages,
            commands::packages::get_package_details,
            commands::packages::uninstall_package,
            commands::packages::clear_package_data,
            commands::packages::force_stop_package,
            commands::packages::disable_package,
            commands::packages::enable_package,
            commands::packages::pull_apk,
            commands::packages::launch_package,
            commands::packages::open_app_settings,
            // install
            commands::install::install_apk,
            commands::install::cancel_install,
            // files
            commands::files::list_files,
            commands::files::pull_file,
            commands::files::push_file,
            commands::files::delete_file,
            // logs
            commands::logs::start_logcat,
            commands::logs::stop_logcat,
            commands::logs::clear_logcat_buffer,
            // shell
            commands::shell::run_shell,
            commands::shell::list_shell_presets,
            commands::shell::get_shell_favorites,
            commands::shell::add_shell_favorite,
            commands::shell::remove_shell_favorite,
            // screenshot
            commands::screenshot::take_screenshot,
            // settings
            commands::settings::get_adb_config,
            commands::settings::set_adb_path,
            commands::settings::validate_adb,
            // history
            commands::history::query_history,
            commands::history::rerun_history,
            commands::history::clear_history,
            commands::history::export_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

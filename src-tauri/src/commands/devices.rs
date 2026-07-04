//! Device detection commands.
//!
//! - `list_devices` — `adb devices -l`
//! - `kill_server` — `adb kill-server`
//! - `start_server` — `adb start-server`
//! - `reconnect_device` — `adb reconnect`
//! - `reconnect_offline` — `adb reconnect offline`
//! - `get_device_overview` — aggregates `getprop`, `wm size`, `wm density`,
//!   `dumpsys battery`, `getenforce`.

use std::sync::Arc;
use std::time::Duration;

use tauri::State;

use crate::adb::models::{Device, DeviceOverview};
use crate::adb::parser::{battery, devices, getprop};
use crate::adb::runner::AdbRunner;
use crate::adb::models::CmdResult;
use crate::audit;
use crate::commands::{history_ref, runner_from_settings};
use crate::error::AdbError;
use crate::history::HistoryStore;
use crate::settings::AppSettings;

/// `adb devices -l`
#[tauri::command]
pub async fn list_devices(
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<Vec<Device>, AdbError> {
    let runner = runner_from_settings(&settings)?;
    let result = runner
        .run(vec!["devices".into(), "-l".into()], None, None)
        .await?;

    let devices = devices::parse_devices(&result.stdout)?;
    audit::log(
        Some(&history_ref(&history)),
        &result.command,
        Some(result.exit_code),
        result.duration_ms,
        None,
        "devices",
        &result.stdout,
        &result.stderr,
    )
    .await;
    if result.exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: result.command,
            exit_code: result.exit_code,
            stderr: result.stderr,
        });
    }
    Ok(devices)
}

/// `adb kill-server`
#[tauri::command]
pub async fn kill_server(
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(&settings, &history, vec!["kill-server".into()], None, "devices").await
}

/// `adb start-server`
#[tauri::command]
pub async fn start_server(
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(&settings, &history, vec!["start-server".into()], None, "devices").await
}

/// `adb reconnect` — reconnect the given device, or all devices if `serial` is None.
#[tauri::command]
pub async fn reconnect_device(
    serial: Option<String>,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(
        &settings,
        &history,
        vec!["reconnect".into()],
        serial.clone(),
        "devices",
    )
    .await
}

/// `adb reconnect offline`
#[tauri::command]
pub async fn reconnect_offline(
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<(), AdbError> {
    run_simple(
        &settings,
        &history,
        vec!["reconnect".into(), "offline".into()],
        None,
        "devices",
    )
    .await
}

/// Aggregate a `DeviceOverview` from multiple adb commands.
#[tauri::command]
pub async fn get_device_overview(
    serial: Option<String>,
    settings: State<'_, std::sync::Mutex<AppSettings>>,
    history: State<'_, Arc<HistoryStore>>,
) -> Result<DeviceOverview, AdbError> {
    let runner = runner_from_settings(&settings)?;
    let overview = build_overview(&runner, &serial).await?;

    // Audit as a single composite entry.
    audit::log(
        Some(&history_ref(&history)),
        "get_device_overview",
        Some(0),
        0,
        serial.as_deref(),
        "devices",
        "",
        "",
    )
    .await;
    Ok(overview)
}

async fn build_overview(
    runner: &AdbRunner,
    serial: &Option<String>,
) -> Result<DeviceOverview, AdbError> {
    // Run getprop.
    let getprop_result = runner
        .run(
            vec!["shell".into(), "getprop".into()],
            serial.clone(),
            Some(Duration::from_secs(15)),
        )
        .await?;
    if getprop_result.exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: getprop_result.command,
            exit_code: getprop_result.exit_code,
            stderr: getprop_result.stderr,
        });
    }
    let props = getprop::parse_getprop(&getprop_result.stdout)?;
    let prop = |k: &str| getprop::get(&props, k);

    // Run dumpsys battery.
    let battery_result = runner
        .run(
            vec!["shell".into(), "dumpsys".into(), "battery".into()],
            serial.clone(),
            Some(Duration::from_secs(15)),
        )
        .await
        .ok();
    let battery = battery_result
        .and_then(|r| battery::parse_battery(&r.stdout).ok());

    // Run getenforce.
    let selinux_result = runner
        .run(
            vec!["shell".into(), "getenforce".into()],
            serial.clone(),
            Some(Duration::from_secs(10)),
        )
        .await
        .ok();
    let selinux = selinux_result.and_then(|r| {
        if r.exit_code == 0 {
            Some(r.stdout.trim().to_string())
        } else {
            None
        }
    });

    // wm size / wm density.
    let size_result = runner
        .run(
            vec!["shell".into(), "wm".into(), "size".into()],
            serial.clone(),
            Some(Duration::from_secs(10)),
        )
        .await
        .ok();
    let screen_resolution = size_result.and_then(|r| {
        r.stdout
            .lines()
            .find(|l| l.contains("Physical size:"))
            .and_then(|l| l.split("Physical size:").nth(1))
            .map(|s| s.trim().to_string())
    });

    let density_result = runner
        .run(
            vec!["shell".into(), "wm".into(), "density".into()],
            serial.clone(),
            Some(Duration::from_secs(10)),
        )
        .await
        .ok();
    let screen_density = density_result.and_then(|r| {
        r.stdout
            .lines()
            .find(|l| l.contains("Physical density:"))
            .and_then(|l| l.split("Physical density:").nth(1))
            .and_then(|s| s.trim().parse().ok())
    });

    // Root check: `id` returning uid 0.
    let root_result = runner
        .run(
            vec!["shell".into(), "id".into()],
            serial.clone(),
            Some(Duration::from_secs(10)),
        )
        .await
        .ok();
    let root = root_result.map(|r| r.stdout.contains("uid=0"));

    Ok(DeviceOverview {
        serial: serial.clone().unwrap_or_default(),
        model: prop("ro.product.model"),
        brand: prop("ro.product.brand"),
        manufacturer: prop("ro.product.manufacturer"),
        android_version: prop("ro.build.version.release"),
        sdk_level: prop("ro.build.version.sdk").and_then(|s| s.parse().ok()),
        build_id: prop("ro.build.id"),
        build_fingerprint: prop("ro.build.fingerprint"),
        security_patch: prop("ro.build.version.security_patch"),
        abi: prop("ro.product.cpu.abi"),
        screen_resolution,
        screen_density,
        battery,
        selinux,
        root,
    })
}

/// Run a single adb command, audit it, and return `()` on success.
pub(crate) async fn run_simple(
    settings: &State<'_, std::sync::Mutex<AppSettings>>,
    history: &State<'_, Arc<HistoryStore>>,
    args: Vec<String>,
    serial: Option<String>,
    module: &str,
) -> Result<(), AdbError> {
    let runner = runner_from_settings(settings)?;
    let result: CmdResult = runner.run(args, serial.clone(), None).await?;
    audit::log(
        Some(&history_ref(history)),
        &result.command,
        Some(result.exit_code),
        result.duration_ms,
        serial.as_deref(),
        module,
        &result.stdout,
        &result.stderr,
    )
    .await;
    if result.exit_code != 0 {
        return Err(AdbError::CommandFailed {
            cmd: result.command,
            exit_code: result.exit_code,
            stderr: result.stderr,
        });
    }
    Ok(())
}

fn main() {
    // Compile-time check: ensure the capabilities/ directory exists and
    // contains at least one .json file. Without capabilities Tauri 2
    // rejects every IPC invoke at runtime (silent, hard to debug).
    let caps_dir = std::path::Path::new("capabilities");
    if !caps_dir.exists() {
        panic!(
            "Tauri 2 requires at least one capability file under `capabilities/`. \
             Run with `src-tauri/capabilities/default.json`. See: \
             https://tauri.app/security/capabilities/"
        );
    }
    let has_json = std::fs::read_dir(caps_dir)
        .ok()
        .map(|it| {
            it.filter_map(|e| e.ok())
                .any(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        })
        .unwrap_or(false);
    if !has_json {
        panic!(
            "No `.json` capability file found under `src-tauri/capabilities/`. \
             Tauri 2 will reject every IPC invoke without one."
        );
    }

    tauri_build::build()
}

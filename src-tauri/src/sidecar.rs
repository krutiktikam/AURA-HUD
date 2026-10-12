use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use log::{info, error};

/// Spawns the backend executable as a sidecar process
pub fn spawn_backend(app_handle: &tauri::AppHandle) -> tauri::async_runtime::JoinHandle<()> {
    let app_handle_clone = app_handle.clone();

    tauri::async_runtime::spawn(async move {
        info!("Starting backend sidecar: aura-backend");

        let sidecar_command = match app_handle_clone.shell().sidecar("aura-backend") {
            Ok(cmd) => cmd,
            Err(e) => {
                error!("Failed to configure backend sidecar: {}", e);
                return;
            }
        };

        let (mut rx, _child) = match sidecar_command.spawn() {
            Ok(res) => res,
            Err(e) => {
                error!("Failed to spawn backend sidecar: {}", e);
                return;
            }
        };

        info!("Backend sidecar spawned successfully. Listening for output...");

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    info!("[backend] {}", line.trim_end());
                    let _ = app_handle_clone.emit("backend-log", line);
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    error!("[backend-err] {}", line.trim_end());
                    let _ = app_handle_clone.emit("backend-error", line);
                }
                CommandEvent::Terminated(payload) => {
                    info!("Backend sidecar process terminated with status: {:?}", payload.code);
                    let _ = app_handle_clone.emit("backend-stopped", payload.code);
                    break;
                }
                _ => {}
            }
        }
    })
}

/// Terminates the backend sidecar process
#[allow(dead_code)]
pub fn terminate_backend() {
    info!("Terminating backend process...");
}

#[tauri::command]
pub fn ping_backend() -> String {
    "pong".to_string()
}
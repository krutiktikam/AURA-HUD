use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use log::{info, error};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};

/// Spawns the backend executable as a sidecar process or local python
pub fn spawn_backend(app_handle: &tauri::AppHandle) -> tauri::async_runtime::JoinHandle<()> {
    let app_handle_clone = app_handle.clone();

    tauri::async_runtime::spawn(async move {
        // Check for local virtual environment python
        let venv_candidates = [
            std::path::PathBuf::from("venv/Scripts/python.exe"),
            std::path::PathBuf::from("../venv/Scripts/python.exe"),
        ];

        let mut python_path = None;
        for candidate in &venv_candidates {
            if candidate.exists() {
                python_path = Some(candidate.clone());
                break;
            }
        }

        if let Some(py) = python_path {
            info!("Starting backend via Python venv: {:?}", py);
            let mut cmd = Command::new(&py);
            cmd.arg("backend/main.py")
               .stdout(Stdio::piped())
               .stderr(Stdio::piped());

            if std::path::Path::new("backend").exists() {
                // current dir is project root
            } else if std::path::Path::new("../backend").exists() {
                cmd.current_dir("..");
            }

            match cmd.spawn() {
                Ok(mut child) => {
                    info!("Python backend spawned successfully with PID: {:?}", child.id());

                    let stdout = child.stdout.take();
                    let app_h = app_handle_clone.clone();
                    if let Some(stdout) = stdout {
                        tauri::async_runtime::spawn(async move {
                            let reader = BufReader::new(stdout);
                            for line in reader.lines().flatten() {
                                info!("[backend] {}", line);
                                let _ = app_h.emit("backend-log", &line);
                            }
                        });
                    }

                    let stderr = child.stderr.take();
                    let app_err_h = app_handle_clone.clone();
                    if let Some(stderr) = stderr {
                        tauri::async_runtime::spawn(async move {
                            let reader = BufReader::new(stderr);
                            for line in reader.lines().flatten() {
                                error!("[backend-err] {}", line);
                                let _ = app_err_h.emit("backend-error", &line);
                            }
                        });
                    }

                    let status = child.wait();
                    info!("Python backend process exited: {:?}", status);
                    let _ = app_handle_clone.emit("backend-stopped", 0);
                    return;
                }
                Err(e) => {
                    error!("Failed to spawn python backend: {}. Falling back to compiled sidecar.", e);
                }
            }
        }

        // Fallback to compiled binary sidecar
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
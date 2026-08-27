use tauri::{Manager, SystemTray, SystemTrayMenu, SystemTrayMenuItem, SystemTrayEvent, GlobalShortcutManagerExt as _, SystemTrayExt as _};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct WindowSize {
    width: f64,
    height: f64,
}

const COMPACT_WIDTH: f64 = 160.0;
const COMPACT_HEIGHT: f64 = 60.0;
const EXPANDED_WIDTH: f64 = 1150.0;
const EXPANDED_HEIGHT: f64 = 420.0;

/// Dynamically resize the transparent OS window with smooth centering
#[tauri::command]
async fn resize_window(
    window: tauri::WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{LogicalSize, LogicalPosition, Size};

    // Get current monitor for screen-relative positioning
    let monitor = window.current_monitor()
        .map_err(|e| format!("Monitor error: {}", e))?
        .ok_or_else(|| "No monitor available".to_string())?;

    let screen_size = monitor.size();
    let screen_width = screen_size.width as f64;

    // Calculate x to center the window
    let x = (screen_width - width) / 2.0;
    let y = 10.0; // Top offset for Dynamic Island feel

    // Set position
    window.set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("Position error: {}", e))?;

    // Set size
    let new_size = Size::Logical(LogicalSize::new(width, height));
    window.set_size(new_size)
        .map_err(|e| format!("Size error: {}", e))?;

    Ok(())
}

#[tauri::command]
fn get_window_state() -> String {
    "compact".to_string()
}

fn build_tray_menu() -> SystemTrayMenu {
    SystemTrayMenu::new()
        .add_item(SystemTrayMenuItem::new("Toggle Island", "toggle", true))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(SystemTrayMenuItem::new("Quit", "quit", true))
}

fn main() {
    let tray_menu = build_tray_menu();
    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "toggle" => {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
                "quit" => std::process::exit(0),
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| match event.event() {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = event.window().hide();
            }
            _ => {}
        })
        .setup(|app| {
            // Set initial window to compact pill size
            if let Some(window) = app.get_webview_window("main") {
                let _ = tauri::async_runtime::spawn(async move {
                    let _ = resize_window(window, COMPACT_WIDTH, COMPACT_HEIGHT).await;
                });
            }

            // Register global shortcut
            let handle = app.handle();
            let _ = app.global_shortcut_manager().register("Ctrl+Shift+Y", move || {
                if let Some(window) = handle.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![resize_window, get_window_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
use tauri::{Manager, SystemTray, SystemTrayMenu, SystemTrayMenuItem, SystemTrayEvent, GlobalShortcutManagerExt as _, SystemTrayExt as _};
use serde::{Deserialize, Serialize};
use arboard::Clipboard;

#[derive(Serialize, Deserialize, Clone)]
struct CursorPosition {
    x: f64,
    y: f64,
}

#[derive(Serialize, Deserialize)]
struct ClipboardContent {
    text: String,
    has_content: bool,
}

const PALETTE_WIDTH: f64 = 420.0;
const PALETTE_HEIGHT: f64 = 420.0;
const EXPANDED_WIDTH: f64 = 1150.0;
const EXPANDED_HEIGHT: f64 = 420.0;

/// Snaps the HUD directly beside the OS cursor with multi-monitor edge protection
#[tauri::command]
async fn anchor_to_cursor(
    window: tauri::WebviewWindow,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<CursorPosition, String> {
    use tauri::{LogicalSize, LogicalPosition, Size, Position};

    let target_w = width.unwrap_or(PALETTE_WIDTH);
    let target_h = height.unwrap_or(PALETTE_HEIGHT);

    let monitor = window.current_monitor()
        .map_err(|e| format!("Monitor error: {}", e))?
        .ok_or_else(|| "No active monitor found".to_string())?;

    let screen_size = monitor.size();
    let scale = monitor.scale_factor();
    let screen_width = screen_size.width as f64 / scale;
    let screen_height = screen_size.height as f64 / scale;

    let cursor_pos = window.cursor_position()
        .map_err(|e| format!("Cursor position error: {}", e))?;

    let cx = cursor_pos.x / scale;
    let cy = cursor_pos.y / scale;

    // Center horizontally on cursor, place slightly below pointer
    let raw_x = cx - (target_w / 2.0);
    let raw_y = cy + 12.0;

    // Clamping to screen boundaries
    let max_x = screen_width - target_w - 12.0;
    let max_y = screen_height - target_h - 12.0;

    let clamped_x = raw_x.clamp(12.0, max_x.max(12.0));
    let clamped_y = raw_y.clamp(12.0, max_y.max(12.0));

    // Apply size & position
    window.set_size(Size::Logical(LogicalSize::new(target_w, target_h)))
        .map_err(|e| format!("Size update error: {}", e))?;

    window.set_position(Position::Logical(LogicalPosition::new(clamped_x, clamped_y)))
        .map_err(|e| format!("Position update error: {}", e))?;

    window.show().map_err(|e| format!("Window show error: {}", e))?;
    window.set_focus().map_err(|e| format!("Window focus error: {}", e))?;

    Ok(CursorPosition { x: clamped_x, y: clamped_y })
}

/// Fetches active text from the OS Clipboard via arboard
#[tauri::command]
fn get_clipboard_text() -> ClipboardContent {
    match Clipboard::new() {
        Ok(mut clipboard) => match clipboard.get_text() {
            Ok(text) => {
                let trimmed = text.trim().to_string();
                let has = !trimmed.is_empty();
                ClipboardContent {
                    has_content: has,
                    text: trimmed,
                }
            }
            Err(_) => ClipboardContent { text: String::new(), has_content: false },
        },
        Err(_) => ClipboardContent { text: String::new(), has_content: false },
    }
}

/// Dynamically resize window for expanded mode
#[tauri::command]
async fn resize_window(
    window: tauri::WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{LogicalSize, LogicalPosition, Size};

    let monitor = window.current_monitor()
        .map_err(|e| format!("Monitor error: {}", e))?
        .ok_or_else(|| "No monitor available".to_string())?;

    let scale = monitor.scale_factor();
    let screen_width = monitor.size().width as f64 / scale;

    let x = (screen_width - width) / 2.0;
    let y = 20.0;

    window.set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| format!("Size error: {}", e))?;

    window.set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("Position error: {}", e))?;

    Ok(())
}

#[tauri::command]
fn get_window_state() -> String {
    "palette".to_string()
}

fn build_tray_menu() -> SystemTrayMenu {
    SystemTrayMenu::new()
        .add_item(SystemTrayMenuItem::new("Summon Palette (Ctrl+Shift+A)", "summon", true))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(SystemTrayMenuItem::new("Toggle Dashboard", "toggle", true))
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
                    let _ = tauri::async_runtime::spawn(async move {
                        let _ = anchor_to_cursor(window, Some(PALETTE_WIDTH), Some(PALETTE_HEIGHT)).await;
                    });
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "summon" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = tauri::async_runtime::spawn(async move {
                            let _ = anchor_to_cursor(window, Some(PALETTE_WIDTH), Some(PALETTE_HEIGHT)).await;
                        });
                    }
                }
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
            let handle = app.handle();

            // Register Hotkeys: Ctrl+Shift+A and Ctrl+Shift+Space for Cursor Summon
            let handle_a = handle.clone();
            let _ = app.global_shortcut_manager().register("Ctrl+Shift+A", move || {
                if let Some(window) = handle_a.get_webview_window("main") {
                    let _ = tauri::async_runtime::spawn(async move {
                        let _ = anchor_to_cursor(window, Some(PALETTE_WIDTH), Some(PALETTE_HEIGHT)).await;
                    });
                }
            });

            let handle_space = handle.clone();
            let _ = app.global_shortcut_manager().register("Ctrl+Shift+Space", move || {
                if let Some(window) = handle_space.get_webview_window("main") {
                    let _ = tauri::async_runtime::spawn(async move {
                        let _ = anchor_to_cursor(window, Some(PALETTE_WIDTH), Some(PALETTE_HEIGHT)).await;
                    });
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![anchor_to_cursor, get_clipboard_text, resize_window, get_window_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
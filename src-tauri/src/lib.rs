#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod sidecar;

use tauri::Manager;
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use serde::{Deserialize, Serialize};
use arboard::Clipboard;
use sidecar::spawn_backend;

#[derive(Serialize, Deserialize, Clone)]
pub struct CursorPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize)]
pub struct ClipboardContent {
    pub text: String,
    pub has_content: bool,
}

pub const PALETTE_WIDTH: f64 = 620.0;
pub const PALETTE_HEIGHT: f64 = 580.0;
pub const EXPANDED_WIDTH: f64 = 1180.0;
pub const EXPANDED_HEIGHT: f64 = 480.0;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            drop(tauri::async_runtime::spawn(async move {
                                let _ = anchor_to_cursor(window, Some(PALETTE_WIDTH), Some(PALETTE_HEIGHT)).await;
                            }));
                        }
                    }
                })
                .build()
        )
        .setup(|app| {
            let handle = app.handle();

            // Setup tray menu
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let summon_item = MenuItem::with_id(app, "summon", "Summon Palette (Ctrl+Shift+A)", true, None::<&str>)?;
            let toggle_item = MenuItem::with_id(app, "toggle", "Toggle Dashboard", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&summon_item, &toggle_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false);

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "summon" => {
                        if let Some(window) = app.get_webview_window("main") {
                            drop(tauri::async_runtime::spawn(async move {
                                let _ = anchor_to_cursor(window, Some(PALETTE_WIDTH), Some(PALETTE_HEIGHT)).await;
                            }));
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
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            drop(tauri::async_runtime::spawn(async move {
                                let _ = anchor_to_cursor(window, Some(PALETTE_WIDTH), Some(PALETTE_HEIGHT)).await;
                            }));
                        }
                    }
                })
                .build(app)?;

            // Register Hotkeys: Ctrl+Shift+A and Ctrl+Shift+Space
            if let Ok(shortcut_a) = "Ctrl+Shift+A".parse::<Shortcut>() {
                let _ = app.global_shortcut().register(shortcut_a);
            }
            if let Ok(shortcut_space) = "Ctrl+Shift+Space".parse::<Shortcut>() {
                let _ = app.global_shortcut().register(shortcut_space);
            }

            // Initialize the sidecar backend
            drop(spawn_backend(handle));

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            anchor_to_cursor,
            get_clipboard_text,
            resize_window,
            get_window_state,
            sidecar::ping_backend
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
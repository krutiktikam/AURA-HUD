#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

#[cfg(windows)]
mod job;
pub mod island;
pub mod supervisor;

use arboard::Clipboard;
use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub struct ApiToken(pub String);

#[derive(Serialize, Deserialize)]
pub struct ClipboardContent {
    pub text: String,
    pub has_content: bool,
}

pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("failed to generate random bytes for API token");
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";
    let mut hex = String::with_capacity(64);
    for &b in &bytes {
        hex.push(HEX_CHARS[(b >> 4) as usize] as char);
        hex.push(HEX_CHARS[(b & 0xf) as usize] as char);
    }
    hex
}

#[tauri::command]
fn get_api_token(token: tauri::State<'_, ApiToken>) -> String {
    token.0.clone()
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
            Err(_) => ClipboardContent {
                text: String::new(),
                has_content: false,
            },
        },
        Err(_) => ClipboardContent {
            text: String::new(),
            has_content: false,
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    let _job = match job::JobObject::new() {
        Ok(job) => match job.assign_current_process() {
            Ok(()) => Some(job),
            Err(e) => {
                log::warn!("Failed to assign current process to Windows job object: {}", e);
                None
            }
        },
        Err(e) => {
            log::warn!("Failed to create Windows job object: {}", e);
            None
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().level(log::LevelFilter::Info).build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("island-toggle", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            let token = generate_token();
            app.manage(ApiToken(token.clone()));

            let handle = app.handle();

            // Setup tray menu
            let toggle_item =
                MenuItem::with_id(app, "toggle", "Toggle (Ctrl+Shift+A)", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new().menu(&menu).show_menu_on_left_click(false);

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        let _ = app.emit("island-toggle", ());
                    }
                    "quit" => {
                        island::quit_app(app.clone());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let _ = app.emit("island-toggle", ());
                    }
                })
                .build(app)?;

            // Register Hotkey: Ctrl+Shift+A
            if let Ok(shortcut_a) = "Ctrl+Shift+A".parse::<Shortcut>() {
                let _ = app.global_shortcut().register(shortcut_a);
            }

            // Initialize the backend supervisor
            let supervisor_handle = supervisor::start_supervisor(handle.clone(), token.clone());
            app.manage(supervisor_handle);

            // Position collapsed window at top center, then show it
            if let Some(window) = app.get_webview_window("main") {
                let _ = island::position_island(&window, false);
                let _ = window.show();
            }

            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_clipboard_text,
            get_api_token,
            island::set_island_mode,
            island::quit_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(sup) = app.try_state::<supervisor::SupervisorHandle>() {
                    sup.shutdown();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_token_length() {
        let token = generate_token();
        assert_eq!(token.len(), 64);
    }

    #[test]
    fn test_generate_token_charset() {
        let token = generate_token();
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_generate_token_uniqueness() {
        let token1 = generate_token();
        let token2 = generate_token();
        assert_ne!(token1, token2);
    }
}

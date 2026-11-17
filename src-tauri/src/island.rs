use std::time::Duration;
use tauri::Manager;
use tauri::{LogicalSize, PhysicalPosition, Position, Size};

// Layout defaults; UI uses the same numbers.
pub const COLLAPSED: (f64, f64) = (220.0, 64.0);
pub const EXPANDED: (f64, f64) = (600.0, 420.0);
pub const TOP_MARGIN: f64 = 12.0;

pub const BLUR_GRACE: std::time::Duration = Duration::from_millis(400); // starting default, not tuned

#[derive(Default)]
pub struct IslandState {
    pub expanded: bool,
    pub expanded_at: Option<std::time::Instant>,
}

pub fn click_through_for_mode(expanded: bool) -> bool {
    !expanded
}

pub fn should_collapse_on_blur(
    expanded: bool,
    since_expand: Option<std::time::Duration>,
    grace: std::time::Duration,
) -> bool {
    expanded && since_expand.is_some_and(|d| d >= grace)
}

/// Calculates the physical top-left position for the island window on a monitor.
/// Returns (x, y) physical coordinates:
/// x = mon_x + (mon_w - round(win_w * scale)) / 2 (never left of mon_x)
/// y = mon_y + round(top_margin * scale)
pub fn island_position(
    monitor_pos: (i32, i32),
    monitor_size: (u32, u32),
    scale: f64,
    win_logical: (f64, f64),
    top_margin_logical: f64,
) -> (i32, i32) {
    let (mon_x, mon_y) = monitor_pos;
    let (mon_w, _) = monitor_size;
    let mon_w = mon_w as i32;

    let physical_w = (win_logical.0 * scale).round() as i32;
    let offset_x = (mon_w - physical_w) / 2;
    let x = mon_x + offset_x.max(0);

    let physical_margin = (top_margin_logical * scale).round() as i32;
    let y = mon_y + physical_margin;

    (x, y)
}

/// Helper to position and resize the window for collapsed or expanded mode on primary monitor (fallback: current).
pub fn position_island(window: &tauri::WebviewWindow, expanded: bool) -> Result<(), String> {
    let (w, h) = if expanded { EXPANDED } else { COLLAPSED };

    let monitor = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.current_monitor().ok().flatten())
        .ok_or_else(|| "No monitor found".to_string())?;

    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    let scale = monitor.scale_factor();

    let (phys_x, phys_y) = island_position(
        (mon_pos.x, mon_pos.y),
        (mon_size.width, mon_size.height),
        scale,
        (w, h),
        TOP_MARGIN,
    );

    window
        .set_size(Size::Logical(LogicalSize::new(w, h)))
        .map_err(|e| e.to_string())?;

    window
        .set_position(Position::Physical(PhysicalPosition::new(phys_x, phys_y)))
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Sizes the main window to COLLAPSED or EXPANDED, positions it on the primary monitor
/// (fallback: current monitor), and on expand also shows and focuses the window.
#[tauri::command]
pub fn set_island_mode(app: tauri::AppHandle, expanded: bool) -> Result<(), String> {
    log::info!("set_island_mode expanded={}", expanded);
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    position_island(&window, expanded)?;

    if expanded {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| {
            log::warn!("Failed to set focus: {}", e);
            e.to_string()
        })?;
    }

    Ok(())
}

/// Shared quit helper: shuts down the supervisor thread then exits the app.
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    if let Some(sup) = app.try_state::<crate::supervisor::SupervisorHandle>() {
        sup.shutdown();
    }
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_island_position_scale_1_0() {
        let pos = island_position((0, 0), (1920, 1080), 1.0, COLLAPSED, TOP_MARGIN);
        // (1920 - 220) / 2 = 850
        assert_eq!(pos, (850, 12));
    }

    #[test]
    fn test_island_position_scale_1_5() {
        let pos = island_position((0, 0), (1920, 1080), 1.5, COLLAPSED, TOP_MARGIN);
        // (220 * 1.5) = 330; (1920 - 330) / 2 = 795
        // 12 * 1.5 = 18
        assert_eq!(pos, (795, 18));
    }

    #[test]
    fn test_island_position_scale_1_25() {
        let pos = island_position((0, 0), (1920, 1080), 1.25, EXPANDED, TOP_MARGIN);
        // (600 * 1.25) = 750; (1920 - 750) / 2 = 585
        // 12 * 1.25 = 15
        assert_eq!(pos, (585, 15));
    }

    #[test]
    fn test_island_position_negative_x() {
        let pos = island_position((-1920, 0), (1920, 1080), 1.0, COLLAPSED, TOP_MARGIN);
        // -1920 + 850 = -1070
        assert_eq!(pos, (-1070, 12));
    }

    #[test]
    fn test_island_position_window_wider_than_monitor() {
        // Monitor width 500, window width 600 -> offset negative, clamped to mon_x
        let pos = island_position((100, 50), (500, 900), 1.0, EXPANDED, TOP_MARGIN);
        assert_eq!(pos, (100, 62));
    }

    #[test]
    fn test_click_through_when_collapsed() {
        assert!(click_through_for_mode(false));
    }

    #[test]
    fn test_no_click_through_when_expanded() {
        assert!(!click_through_for_mode(true));
    }

    #[test]
    fn test_blur_ignored_when_collapsed() {
        assert!(!should_collapse_on_blur(
            false,
            Some(Duration::from_millis(500)),
            BLUR_GRACE
        ));
    }

    #[test]
    fn test_blur_ignored_within_grace() {
        assert!(!should_collapse_on_blur(
            true,
            Some(Duration::from_millis(200)),
            BLUR_GRACE
        ));
    }

    #[test]
    fn test_blur_collapses_after_grace() {
        assert!(should_collapse_on_blur(
            true,
            Some(Duration::from_millis(400)),
            BLUR_GRACE
        ));
        assert!(should_collapse_on_blur(
            true,
            Some(Duration::from_millis(500)),
            BLUR_GRACE
        ));
    }

    #[test]
    fn test_blur_ignored_without_expand_time() {
        assert!(!should_collapse_on_blur(true, None, BLUR_GRACE));
    }
}

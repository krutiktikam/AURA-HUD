// Layout defaults; UI uses the same numbers.
pub const COLLAPSED: (f64, f64) = (220.0, 64.0);
pub const EXPANDED: (f64, f64) = (600.0, 420.0);
pub const TOP_MARGIN: f64 = 12.0;

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
}

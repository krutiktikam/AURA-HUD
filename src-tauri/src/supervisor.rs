use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// Default port for the backend server.
pub const BACKEND_PORT: u16 = 8000;

/// Calculates backoff delay based on retry attempt.
/// Timing constants are starting defaults (not tuned): 1s, 2s, 4s, 8s, 16s, then 30s cap.
pub fn backoff_delay(attempt: u32) -> Duration {
    match attempt {
        0 | 1 => Duration::from_secs(1),
        2 => Duration::from_secs(2),
        3 => Duration::from_secs(4),
        4 => Duration::from_secs(8),
        5 => Duration::from_secs(16),
        _ => Duration::from_secs(30),
    }
}

/// Circuit breaker for backend process restarts.
/// Timing and retry constants are starting defaults (not tuned):
/// 5 consecutive failed starts trip the breaker; 60 seconds of continuous health resets it.
pub const DEFAULT_BREAKER_MAX_FAILURES: u32 = 5;
pub const DEFAULT_BREAKER_HEALTHY_RESET_SECS: u64 = 60;

#[derive(Debug, Clone)]
pub struct Breaker {
    max_failures: u32,
    healthy_reset_duration: Duration,
    consecutive_failures: u32,
    healthy_since: Option<Instant>,
    tripped: bool,
}

impl Default for Breaker {
    fn default() -> Self {
        Self::new()
    }
}

impl Breaker {
    pub fn new() -> Self {
        Self::with_config(
            DEFAULT_BREAKER_MAX_FAILURES,
            Duration::from_secs(DEFAULT_BREAKER_HEALTHY_RESET_SECS),
        )
    }

    pub fn with_config(max_failures: u32, healthy_reset_duration: Duration) -> Self {
        Self {
            max_failures,
            healthy_reset_duration,
            consecutive_failures: 0,
            healthy_since: None,
            tripped: false,
        }
    }

    /// Record a failed start or crash.
    pub fn record_failure(&mut self) {
        self.healthy_since = None;
        self.consecutive_failures += 1;
        if self.consecutive_failures >= self.max_failures {
            self.tripped = true;
        }
    }

    /// Record a healthy check at the given instant.
    /// Resets consecutive failures once the backend has stayed healthy for the reset duration.
    pub fn record_healthy(&mut self, now: Instant) {
        if self.tripped {
            return;
        }
        match self.healthy_since {
            None => {
                self.healthy_since = Some(now);
            }
            Some(since) => {
                if now.duration_since(since) >= self.healthy_reset_duration {
                    self.consecutive_failures = 0;
                }
            }
        }
    }

    pub fn is_tripped(&self) -> bool {
        self.tripped
    }

    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures
    }

    pub fn reset(&mut self) {
        self.consecutive_failures = 0;
        self.healthy_since = None;
        self.tripped = false;
    }
}

/// Check if the given local TCP port is free to bind.
pub fn port_is_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Perform a synchronous HTTP GET request to /api/health over std::net::TcpStream.
/// Returns true only if the server returns a 200 status code.
/// The token is used solely in the Authorization header sent to 127.0.0.1 and is never logged.
pub fn http_health_ok(port: u16, token: &str, timeout: Duration) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&addr, timeout) {
        Ok(s) => s,
        Err(_) => return false,
    };

    if stream.set_read_timeout(Some(timeout)).is_err() {
        return false;
    }
    if stream.set_write_timeout(Some(timeout)).is_err() {
        return false;
    }

    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n",
        port, token
    );

    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    if reader.read_line(&mut status_line).is_err() {
        return false;
    }

    // Status line format: "HTTP/1.1 200 OK"
    let parts: Vec<&str> = status_line.split_whitespace().collect();
    parts.len() >= 2 && parts[1] == "200"
}

/// Kill a process tree by PID using taskkill on Windows.
pub fn kill_process_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct BackendStatusPayload {
    pub state: String,
    pub attempt: u32,
}

fn emit_status(app_handle: &tauri::AppHandle, state: &str, attempt: u32) {
    let payload = BackendStatusPayload {
        state: state.to_string(),
        attempt,
    };
    let _ = app_handle.emit("backend-status", payload);
}

fn sleep_with_stop_flag(duration: Duration, stop_flag: &AtomicBool) {
    let start = Instant::now();
    while start.elapsed() < duration && !stop_flag.load(Ordering::SeqCst) {
        let remaining = duration.saturating_sub(start.elapsed());
        thread::sleep(remaining.min(Duration::from_millis(100)));
    }
}

#[cfg(debug_assertions)]
fn resolve_backend_command(token: &str) -> std::io::Result<Command> {
    let candidates = [
        std::path::PathBuf::from("venv/Scripts/python.exe"),
        std::path::PathBuf::from("../venv/Scripts/python.exe"),
    ];

    let mut python_path = None;
    for candidate in &candidates {
        if candidate.exists() {
            python_path = Some(candidate.clone());
            break;
        }
    }

    let py = python_path.ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Python virtual environment not found in venv/Scripts/python.exe or ../venv/Scripts/python.exe",
        )
    })?;

    let mut cmd = Command::new(py);
    cmd.args(["-m", "backend.main"])
        .env("AURA_API_TOKEN", token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    if std::path::Path::new("backend").exists() {
        // Current directory is repo root
    } else if std::path::Path::new("../backend").exists() {
        cmd.current_dir("..");
    }

    Ok(cmd)
}

#[cfg(not(debug_assertions))]
fn resolve_backend_command(token: &str) -> std::io::Result<Command> {
    let exe = std::env::current_exe()?;
    let dir = exe.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Failed to resolve current executable directory",
        )
    })?;
    let backend_exe = dir.join("aura-backend.exe");

    let mut cmd = Command::new(backend_exe);
    cmd.env("AURA_API_TOKEN", token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    Ok(cmd)
}

#[derive(Clone)]
pub struct SupervisorHandle {
    stop_flag: Arc<AtomicBool>,
    current_pid: Arc<AtomicU32>,
    thread_handle: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
}

impl SupervisorHandle {
    /// Shutdown the supervisor thread and kill the backend process tree.
    /// Timing constants are starting defaults (not tuned): 3s limit to join the thread.
    pub fn shutdown(&self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        let pid = self.current_pid.load(Ordering::SeqCst);
        if pid != 0 {
            kill_process_tree(pid);
        }

        let mut guard = match self.thread_handle.lock() {
            Ok(g) => g,
            Err(poisoned) => poisoned.into_inner(),
        };

        if let Some(handle) = guard.take() {
            let (tx, rx) = std::sync::mpsc::channel();
            thread::spawn(move || {
                let res = handle.join();
                let _ = tx.send(res);
            });
            // Starting default (not tuned): 3s shutdown join timeout.
            let _ = rx.recv_timeout(Duration::from_secs(3));
        }
    }
}

/// Spawns the supervisor thread monitoring the backend sidecar.
pub fn start_supervisor(app_handle: tauri::AppHandle, token: String) -> SupervisorHandle {
    let stop_flag = Arc::new(AtomicBool::new(false));
    let current_pid = Arc::new(AtomicU32::new(0));

    let stop_flag_clone = stop_flag.clone();
    let current_pid_clone = current_pid.clone();

    let thread = thread::Builder::new()
        .name("backend-supervisor".into())
        .spawn(move || {
            let port = BACKEND_PORT;

            // Preflight port check
            if !port_is_free(port) {
                log::error!("Port {} is already in use; terminating supervisor", port);
                emit_status(&app_handle, "port_in_use", 0);
                return;
            }

            let mut breaker = Breaker::new();
            let mut attempt: u32 = 0;

            // Starting default (not tuned): 90s startup grace for backend initialization.
            const STARTUP_GRACE: Duration = Duration::from_secs(90);
            // Starting default (not tuned): 500ms polling interval during startup grace.
            const STARTUP_POLL_INTERVAL: Duration = Duration::from_millis(500);
            // Starting default (not tuned): 2s steady-state health check interval.
            const HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(2);
            // Starting default (not tuned): 1s timeout for health check requests.
            const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(1);
            // Starting default (not tuned): 3 consecutive health failures triggers restart.
            const MAX_CONSECUTIVE_HEALTH_FAILURES: u32 = 3;

            while !stop_flag_clone.load(Ordering::SeqCst) {
                if attempt == 0 {
                    emit_status(&app_handle, "starting", attempt);
                } else {
                    emit_status(&app_handle, "restarting", attempt);
                }

                let mut cmd = match resolve_backend_command(&token) {
                    Ok(c) => c,
                    Err(e) => {
                        log::error!("Failed to resolve backend command: {}", e);
                        breaker.record_failure();
                        if breaker.is_tripped() {
                            emit_status(&app_handle, "failed", attempt);
                            return;
                        }
                        attempt += 1;
                        sleep_with_stop_flag(backoff_delay(attempt), &stop_flag_clone);
                        continue;
                    }
                };

                let mut child = match cmd.spawn() {
                    Ok(c) => c,
                    Err(e) => {
                        log::error!("Failed to spawn backend process: {}", e);
                        breaker.record_failure();
                        if breaker.is_tripped() {
                            emit_status(&app_handle, "failed", attempt);
                            return;
                        }
                        attempt += 1;
                        sleep_with_stop_flag(backoff_delay(attempt), &stop_flag_clone);
                        continue;
                    }
                };

                let child_pid = child.id();
                current_pid_clone.store(child_pid, Ordering::SeqCst);

                // Drain stdout and stderr at debug! level only (never emitted to frontend)
                if let Some(stdout) = child.stdout.take() {
                    thread::spawn(move || {
                        let reader = BufReader::new(stdout);
                        for line in reader.lines().map_while(Result::ok) {
                            log::debug!("[backend] {}", line);
                        }
                    });
                }

                if let Some(stderr) = child.stderr.take() {
                    thread::spawn(move || {
                        let reader = BufReader::new(stderr);
                        for line in reader.lines().map_while(Result::ok) {
                            log::debug!("[backend-err] {}", line);
                        }
                    });
                }

                // Startup grace period
                let grace_start = Instant::now();
                let mut became_healthy = false;

                while grace_start.elapsed() < STARTUP_GRACE
                    && !stop_flag_clone.load(Ordering::SeqCst)
                {
                    if let Ok(Some(status)) = child.try_wait() {
                        log::warn!(
                            "Backend process exited prematurely during startup: {:?}",
                            status
                        );
                        break;
                    }

                    if http_health_ok(port, &token, HEALTH_CHECK_TIMEOUT) {
                        became_healthy = true;
                        break;
                    }

                    sleep_with_stop_flag(STARTUP_POLL_INTERVAL, &stop_flag_clone);
                }

                if stop_flag_clone.load(Ordering::SeqCst) {
                    kill_process_tree(child_pid);
                    let _ = child.wait();
                    current_pid_clone.store(0, Ordering::SeqCst);
                    return;
                }

                if !became_healthy {
                    kill_process_tree(child_pid);
                    let _ = child.wait();
                    current_pid_clone.store(0, Ordering::SeqCst);

                    breaker.record_failure();
                    if breaker.is_tripped() {
                        emit_status(&app_handle, "failed", attempt);
                        return;
                    }

                    attempt += 1;
                    sleep_with_stop_flag(backoff_delay(attempt), &stop_flag_clone);
                    continue;
                }

                // Backend is ready
                emit_status(&app_handle, "ready", attempt);
                breaker.record_healthy(Instant::now());

                // Steady state monitoring
                let mut consecutive_health_failures = 0;

                while !stop_flag_clone.load(Ordering::SeqCst) {
                    sleep_with_stop_flag(HEALTH_CHECK_INTERVAL, &stop_flag_clone);
                    if stop_flag_clone.load(Ordering::SeqCst) {
                        break;
                    }

                    match child.try_wait() {
                        Ok(Some(status)) => {
                            log::warn!("Backend process exited: {:?}", status);
                            break;
                        }
                        Err(e) => {
                            log::warn!("Error checking backend child status: {}", e);
                            break;
                        }
                        Ok(None) => {}
                    }

                    if http_health_ok(port, &token, HEALTH_CHECK_TIMEOUT) {
                        consecutive_health_failures = 0;
                        breaker.record_healthy(Instant::now());
                    } else {
                        consecutive_health_failures += 1;
                        log::warn!(
                            "Backend health check failed ({}/{} failures)",
                            consecutive_health_failures,
                            MAX_CONSECUTIVE_HEALTH_FAILURES
                        );
                        if consecutive_health_failures >= MAX_CONSECUTIVE_HEALTH_FAILURES {
                            log::warn!(
                                "3 consecutive health check failures reached; restarting backend"
                            );
                            break;
                        }
                    }
                }

                kill_process_tree(child_pid);
                let _ = child.wait();
                current_pid_clone.store(0, Ordering::SeqCst);

                if stop_flag_clone.load(Ordering::SeqCst) {
                    return;
                }

                breaker.record_failure();
                if breaker.is_tripped() {
                    emit_status(&app_handle, "failed", attempt);
                    return;
                }

                attempt += 1;
                emit_status(&app_handle, "restarting", attempt);
                sleep_with_stop_flag(backoff_delay(attempt), &stop_flag_clone);
            }
        })
        .expect("failed to spawn supervisor thread");

    SupervisorHandle {
        stop_flag,
        current_pid,
        thread_handle: Arc::new(Mutex::new(Some(thread))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::thread;

    #[test]
    fn test_backoff_schedule() {
        assert_eq!(backoff_delay(0), Duration::from_secs(1));
        assert_eq!(backoff_delay(1), Duration::from_secs(1));
        assert_eq!(backoff_delay(2), Duration::from_secs(2));
        assert_eq!(backoff_delay(3), Duration::from_secs(4));
        assert_eq!(backoff_delay(4), Duration::from_secs(8));
        assert_eq!(backoff_delay(5), Duration::from_secs(16));
        assert_eq!(backoff_delay(6), Duration::from_secs(30));
        assert_eq!(backoff_delay(10), Duration::from_secs(30));
    }

    #[test]
    fn test_breaker_trip_and_reset() {
        let mut breaker = Breaker::new();
        assert!(!breaker.is_tripped());
        assert_eq!(breaker.consecutive_failures(), 0);

        for i in 1..=4 {
            breaker.record_failure();
            assert!(!breaker.is_tripped());
            assert_eq!(breaker.consecutive_failures(), i);
        }

        breaker.record_failure();
        assert!(breaker.is_tripped());
        assert_eq!(breaker.consecutive_failures(), 5);

        // Test healthy reset with configurable duration
        let mut breaker2 = Breaker::with_config(5, Duration::from_secs(60));
        for _ in 0..3 {
            breaker2.record_failure();
        }
        assert_eq!(breaker2.consecutive_failures(), 3);

        let t0 = Instant::now();
        breaker2.record_healthy(t0);
        assert_eq!(breaker2.consecutive_failures(), 3);

        // Advance 59s: still not reset
        breaker2.record_healthy(t0 + Duration::from_secs(59));
        assert_eq!(breaker2.consecutive_failures(), 3);

        // Advance to 60s: reset to 0
        breaker2.record_healthy(t0 + Duration::from_secs(60));
        assert_eq!(breaker2.consecutive_failures(), 0);
    }

    #[test]
    fn test_port_is_free() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("failed to bind test listener");
        let port = listener.local_addr().unwrap().port();

        assert!(!port_is_free(port), "bound port should not report as free");
        drop(listener);
        assert!(port_is_free(port), "unbound port should report as free");
    }

    #[test]
    fn test_http_health_ok_responses() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("failed to bind test listener");
        let port = listener.local_addr().unwrap().port();
        let expected_token = "test-secret-token-12345";

        let server_handle = thread::spawn(move || {
            // Case 1: 200 OK
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buffer = [0u8; 1024];
                let n = stream.read(&mut buffer).unwrap_or(0);
                let req = String::from_utf8_lossy(&buffer[..n]);
                assert!(
                    req.contains(&format!("Authorization: Bearer {}", expected_token)),
                    "request missing Authorization header"
                );
                let response = "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(response.as_bytes());
            }

            // Case 2: 401 Unauthorized
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buffer = [0u8; 1024];
                let n = stream.read(&mut buffer).unwrap_or(0);
                let req = String::from_utf8_lossy(&buffer[..n]);
                assert!(
                    req.contains(&format!("Authorization: Bearer {}", expected_token)),
                    "request missing Authorization header"
                );
                let response =
                    "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(response.as_bytes());
            }

            // Case 3: 503 Service Unavailable
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buffer = [0u8; 1024];
                let n = stream.read(&mut buffer).unwrap_or(0);
                let req = String::from_utf8_lossy(&buffer[..n]);
                assert!(
                    req.contains(&format!("Authorization: Bearer {}", expected_token)),
                    "request missing Authorization header"
                );
                let response = "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(response.as_bytes());
            }

            // Case 4: Immediate close
            if let Ok((stream, _)) = listener.accept() {
                drop(stream);
            }
        });

        let timeout = Duration::from_secs(3);

        // 200 OK
        assert!(http_health_ok(port, expected_token, timeout));

        // 401 Unauthorized
        assert!(!http_health_ok(port, expected_token, timeout));

        // 503 Service Unavailable
        assert!(!http_health_ok(port, expected_token, timeout));

        // Immediate close
        assert!(!http_health_ok(port, expected_token, timeout));

        server_handle.join().expect("server thread failed");
    }

    #[test]
    fn test_kill_process_tree() {
        let mut child = Command::new("cmd")
            .args(["/c", "ping", "-n", "30", "127.0.0.1"])
            .spawn()
            .expect("failed to spawn child");
        let pid = child.id();
        kill_process_tree(pid);

        let start = Instant::now();
        let mut exited = false;
        while start.elapsed() < Duration::from_secs(5) {
            if child.try_wait().unwrap().is_some() {
                exited = true;
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        assert!(exited, "taskkill should terminate child within 5 seconds");
    }
}

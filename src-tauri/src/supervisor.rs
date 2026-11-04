use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::time::{Duration, Instant};

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
}

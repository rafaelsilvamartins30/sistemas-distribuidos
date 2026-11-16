use std::env;
use std::io::{self, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::time::Duration;

pub mod attendance;
pub mod auth;
pub mod http_api;

const DEFAULT_DB_URL: &str = "postgres://unir:unir-local-only@localhost:15436/unir_access";
const DEFAULT_PORT: &str = "8080";
const DB_CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const STREAM_IO_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Config {
    pub listen_addr: String,
    pub db_host_port: String,
}

impl Config {
    #[must_use]
    pub fn from_env() -> Self {
        let port = env::var("PORT")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_PORT.to_string());
        let db_url = env::var("DB_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_DB_URL.to_string());

        Self {
            listen_addr: format!("0.0.0.0:{port}"),
            db_host_port: extract_host_port(&db_url),
        }
    }
}

#[must_use]
pub fn extract_host_port(db_url: &str) -> String {
    let without_scheme = db_url.split_once("://").map_or(db_url, |(_, rest)| rest);
    let authority = without_scheme.split('/').next().unwrap_or(without_scheme);
    let host_port = authority
        .rsplit_once('@')
        .map_or(authority, |(_, rest)| rest);

    if host_port.is_empty() {
        "localhost:5432".to_string()
    } else if host_port.contains(':') {
        host_port.to_string()
    } else {
        format!("{host_port}:5432")
    }
}

#[must_use]
pub fn check_database(host_port: &str) -> bool {
    let Ok(addrs) = host_port.to_socket_addrs() else {
        return false;
    };

    for addr in addrs {
        if TcpStream::connect_timeout(&addr, DB_CONNECT_TIMEOUT).is_ok() {
            return true;
        }
    }

    false
}

#[derive(Debug, PartialEq, Eq)]
pub struct HttpResponse {
    pub status_code: u16,
    pub reason: &'static str,
    pub body: String,
}

impl HttpResponse {
    #[must_use]
    pub fn to_bytes(&self) -> Vec<u8> {
        format!(
            "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            self.status_code,
            self.reason,
            self.body.len(),
            self.body
        )
        .into_bytes()
    }
}

#[must_use]
pub fn route_request<F>(raw_request: &str, db_check: F) -> HttpResponse
where
    F: FnOnce() -> bool,
{
    let mut lines = raw_request.lines();
    let Some(request_line) = lines.next() else {
        return HttpResponse {
            status_code: 400,
            reason: "Bad Request",
            body: r#"{"error":"Malformed HTTP request"}"#.to_string(),
        };
    };

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_path = parts.next().unwrap_or("");
    let path = raw_path.split('?').next().unwrap_or(raw_path);

    if path == "/health" {
        if method != "GET" {
            return HttpResponse {
                status_code: 405,
                reason: "Method Not Allowed",
                body: r#"{"error":"Method not allowed"}"#.to_string(),
            };
        }

        if db_check() {
            return HttpResponse {
                status_code: 200,
                reason: "OK",
                body: r#"{"service":"access","status":"ok","database":"up"}"#.to_string(),
            };
        }

        return HttpResponse {
            status_code: 503,
            reason: "Service Unavailable",
            body: r#"{"service":"access","status":"degraded","database":"down"}"#.to_string(),
        };
    }

    let has_bearer = lines.any(|line| {
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("authorization") {
                let trimmed = value.trim();
                if let Some(token) = trimmed
                    .strip_prefix("Bearer ")
                    .or_else(|| trimmed.strip_prefix("bearer "))
                {
                    return !token.trim().is_empty();
                }
            }
        }
        false
    });

    if !has_bearer {
        return HttpResponse {
            status_code: 401,
            reason: "Unauthorized",
            body: r#"{"error":"A bearer token is required"}"#.to_string(),
        };
    }

    HttpResponse {
        status_code: 404,
        reason: "Not Found",
        body: r#"{"error":"Route not found"}"#.to_string(),
    }
}

/// Handles a single incoming TCP connection.
///
/// # Errors
///
/// Returns an `io::Error` if reading from or writing to the stream fails.
pub fn handle_connection(mut stream: TcpStream, db_host_port: &str) -> io::Result<()> {
    let _ = stream.set_read_timeout(Some(STREAM_IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(STREAM_IO_TIMEOUT));

    let mut buffer = [0_u8; 4096];
    let bytes_read = stream.read(&mut buffer)?;
    let raw_request = String::from_utf8_lossy(&buffer[..bytes_read]);

    let response = route_request(&raw_request, || check_database(db_host_port));
    stream.write_all(&response.to_bytes())?;
    stream.flush()
}

/// Binds a listener and returns the listener along with its bound socket address.
///
/// # Errors
///
/// Returns an `io::Error` if the address cannot be bound.
pub fn bind_listener(listen_addr: &str) -> io::Result<(TcpListener, SocketAddr)> {
    let listener = TcpListener::bind(listen_addr)?;
    let addr = listener.local_addr()?;
    Ok((listener, addr))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_host_port_parses_postgres_urls() {
        assert_eq!(
            extract_host_port("postgres://unir:secret@access-db:5432/unir_access"),
            "access-db:5432"
        );
        assert_eq!(
            extract_host_port("postgresql://localhost:15436/unir_access"),
            "localhost:15436"
        );
        assert_eq!(
            extract_host_port("postgres://unir@access-db/unir_access"),
            "access-db:5432"
        );
    }

    #[test]
    fn health_returns_ok_when_database_is_reachable() {
        let response = route_request("GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n", || true);

        assert_eq!(response.status_code, 200);
        assert_eq!(
            response.body,
            r#"{"service":"access","status":"ok","database":"up"}"#
        );
    }

    #[test]
    fn health_returns_service_unavailable_when_database_is_down() {
        let response = route_request("GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n", || false);

        assert_eq!(response.status_code, 503);
        assert_eq!(
            response.body,
            r#"{"service":"access","status":"degraded","database":"down"}"#
        );
    }

    #[test]
    fn protected_routes_require_bearer_token() {
        let unauthorized = route_request(
            "GET /credentials HTTP/1.1\r\nHost: localhost\r\n\r\n",
            || true,
        );
        assert_eq!(unauthorized.status_code, 401);

        let authorized = route_request(
            "GET /credentials HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer valid-token\r\n\r\n",
            || true,
        );
        assert_eq!(authorized.status_code, 404);
    }

    #[test]
    fn check_database_detects_bound_tcp_listener() {
        let Ok((_listener, addr)) = bind_listener("127.0.0.1:0") else {
            panic!("expected ephemeral listener to bind");
        };

        assert!(check_database(&addr.to_string()));
    }
}

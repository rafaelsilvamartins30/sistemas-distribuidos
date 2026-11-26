use crate::{
    attendance::{
        confirm_organizer_check_in, event_attendance_review, get_my_attendance, get_my_tickets,
        get_organizer_action_info, issue_event_qr_for_creator, issue_participant_qr,
        preview_organizer_check_in, record_participant_check_in, CheckInError,
    },
    auth::{JwtError, JwtVerifier},
};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPool;
use std::{io, net::SocketAddr};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
use uuid::Uuid;

const MAX_REQUEST_BYTES: usize = 16 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CheckInRequest {
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiProblem<'a> {
    status: u16,
    title: &'a str,
    detail: &'a str,
}

struct Response {
    status: u16,
    reason: &'static str,
    content_type: &'static str,
    body: String,
}

impl Response {
    fn json<T: Serialize>(status: u16, reason: &'static str, value: &T) -> Self {
        Self {
            status,
            reason,
            content_type: "application/json",
            body: serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string()),
        }
    }

    fn problem(
        status: u16,
        reason: &'static str,
        title: &'static str,
        detail: &'static str,
    ) -> Self {
        Self {
            status,
            reason,
            content_type: "application/problem+json",
            body: serde_json::to_string(&ApiProblem {
                status,
                title,
                detail,
            })
            .unwrap_or_else(|_| "{}".to_string()),
        }
    }

    fn to_bytes(&self) -> Vec<u8> {
        format!(
            "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            self.status,
            self.reason,
            self.content_type,
            self.body.len(),
            self.body
        )
        .into_bytes()
    }
}

pub async fn serve(listen_addr: &str, pool: PgPool, verifier: JwtVerifier) -> io::Result<()> {
    let listener = TcpListener::bind(listen_addr).await?;
    let addr: SocketAddr = listener.local_addr()?;
    println!("Access listening on {addr}");
    loop {
        let (stream, _) = listener.accept().await?;
        let pool = pool.clone();
        let verifier = verifier.clone();
        tokio::spawn(async move {
            if let Err(error) = handle_connection(stream, &pool, &verifier).await {
                eprintln!("Access HTTP connection error: {error}");
            }
        });
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    pool: &PgPool,
    verifier: &JwtVerifier,
) -> io::Result<()> {
    let response = match read_request(&mut stream).await {
        Ok(Some(request)) => route_request(pool, verifier, &request).await,
        Ok(None) => Response::problem(400, "Bad Request", "Bad Request", "Malformed HTTP request"),
        Err(ReadRequestError::TooLarge) => Response::problem(
            413,
            "Payload Too Large",
            "Payload Too Large",
            "Request is too large",
        ),
        Err(ReadRequestError::Io(error)) => return Err(error),
    };
    stream.write_all(&response.to_bytes()).await?;
    stream.flush().await
}

struct HttpRequest {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

enum ReadRequestError {
    TooLarge,
    Io(io::Error),
}

async fn read_request(stream: &mut TcpStream) -> Result<Option<HttpRequest>, ReadRequestError> {
    let mut bytes = Vec::new();
    let mut buffer = [0; 2048];
    let mut header_end = None;
    let mut expected_body_bytes = None;
    loop {
        if bytes.len() >= MAX_REQUEST_BYTES {
            return Err(ReadRequestError::TooLarge);
        }
        let read = stream
            .read(&mut buffer)
            .await
            .map_err(ReadRequestError::Io)?;
        if read == 0 {
            return Ok(None);
        }
        bytes.extend_from_slice(&buffer[..read]);

        if header_end.is_none() {
            header_end = find_header_end(&bytes);
            if let Some(end) = header_end {
                let headers = String::from_utf8_lossy(&bytes[..end]);
                let content_length = headers
                    .lines()
                    .skip(1)
                    .filter_map(|line| line.split_once(':'))
                    .find(|(name, _)| name.trim().eq_ignore_ascii_case("content-length"))
                    .and_then(|(_, value)| value.trim().parse::<usize>().ok())
                    .unwrap_or(0);
                if content_length > MAX_REQUEST_BYTES - end - 4 {
                    return Err(ReadRequestError::TooLarge);
                }
                expected_body_bytes = Some(content_length);
            }
        }

        if let (Some(end), Some(body_bytes)) = (header_end, expected_body_bytes) {
            if bytes.len() >= end + 4 + body_bytes {
                return Ok(parse_request(&bytes, end));
            }
        }
    }
}

fn find_header_end(bytes: &[u8]) -> Option<usize> {
    bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn parse_request(bytes: &[u8], header_end: usize) -> Option<HttpRequest> {
    let headers_text = String::from_utf8_lossy(&bytes[..header_end]);
    let mut lines = headers_text.lines();
    let mut request_line = lines.next()?.split_whitespace();
    let method = request_line.next()?.to_string();
    let path = request_line.next()?.to_string();
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_string(), value.trim().to_string()))
        .collect();
    Some(HttpRequest {
        method,
        path,
        headers,
        body: bytes[header_end + 4..].to_vec(),
    })
}

async fn route_request(pool: &PgPool, verifier: &JwtVerifier, request: &HttpRequest) -> Response {
    let path = request.path.split('?').next().unwrap_or(&request.path);
    if path == "/health" {
        if request.method != "GET" {
            return method_not_allowed();
        }
        return match sqlx::query("SELECT 1").execute(pool).await {
            Ok(_) => Response::json(
                200,
                "OK",
                &serde_json::json!({"service":"access","status":"ok"}),
            ),
            Err(_) => Response::problem(
                503,
                "Service Unavailable",
                "Service Unavailable",
                "Access database is unavailable",
            ),
        };
    }

    let authenticated_subject = match bearer_token(&request.headers) {
        None => {
            return Response::problem(
                401,
                "Unauthorized",
                "Unauthorized",
                "A bearer token is required",
            )
        }
        Some(token) => match verifier.verify_subject(token).await {
            Ok(subject) => subject,
            Err(JwtError::Unauthorized) => {
                return Response::problem(
                    401,
                    "Unauthorized",
                    "Unauthorized",
                    "The bearer token is invalid or expired",
                )
            }
            Err(JwtError::Forbidden) => {
                return Response::problem(
                    403,
                    "Forbidden",
                    "Forbidden",
                    "A UNIR user role is required",
                )
            }
            Err(JwtError::Unavailable) => {
                return Response::problem(
                    503,
                    "Service Unavailable",
                    "Service Unavailable",
                    "Token validation is unavailable",
                )
            }
        },
    };

    match (request.method.as_str(), path) {
        ("POST", "/api/v1/attendance/check-ins") => {
            let body = match serde_json::from_slice::<CheckInRequest>(&request.body) {
                Ok(body) if body.token.len() <= 512 => body,
                _ => {
                    return Response::problem(
                        400,
                        "Bad Request",
                        "Bad Request",
                        "A QR token is required",
                    )
                }
            };
            match record_participant_check_in(pool, &body.token, &authenticated_subject).await {
                Ok(result) => Response::json(200, "OK", &result),
                Err(error) => check_in_error(error),
            }
        }
        ("GET", "/api/v1/attendance/me") => {
            let event_id = match query_parameter(&request.path, "eventId")
                .and_then(|value| Uuid::parse_str(value).ok())
            {
                Some(event_id) => event_id,
                None => {
                    return Response::problem(
                        400,
                        "Bad Request",
                        "Bad Request",
                        "eventId must be a UUID",
                    )
                }
            };
            match get_my_attendance(pool, event_id, &authenticated_subject).await {
                Ok(Some(attendance)) => Response::json(200, "OK", &attendance),
                Ok(None) => Response::problem(
                    404,
                    "Not Found",
                    "Not Found",
                    "Attendance entry was not found",
                ),
                Err(_) => Response::problem(
                    503,
                    "Service Unavailable",
                    "Service Unavailable",
                    "Attendance is unavailable",
                ),
            }
        }
        ("GET", "/api/v1/attendance/tickets/me") => {
            match get_my_tickets(pool, &authenticated_subject).await {
                Ok(tickets) => Response::json(200, "OK", &tickets),
                Err(_) => Response::problem(
                    503,
                    "Service Unavailable",
                    "Service Unavailable",
                    "Tickets are unavailable",
                ),
            }
        }
        ("POST", "/api/v1/attendance/organizer-check-ins/preview") => {
            let body = match serde_json::from_slice::<CheckInRequest>(&request.body) {
                Ok(body) if !body.token.trim().is_empty() && body.token.len() <= 512 => body,
                _ => return invalid_qr_request(),
            };
            match preview_organizer_check_in(pool, &body.token, &authenticated_subject).await {
                Ok(result) => Response::json(200, "OK", &result),
                Err(error) => check_in_error(error),
            }
        }
        ("POST", "/api/v1/attendance/organizer-check-ins/confirm") => {
            let body = match serde_json::from_slice::<CheckInRequest>(&request.body) {
                Ok(body) if !body.token.trim().is_empty() && body.token.len() <= 512 => body,
                _ => return invalid_qr_request(),
            };
            match confirm_organizer_check_in(pool, &body.token, &authenticated_subject).await {
                Ok(result) => Response::json(200, "OK", &result),
                Err(error) => check_in_error(error),
            }
        }
        ("GET" | "POST", _)
            if path.starts_with("/api/v1/attendance/events/")
                && path.ends_with("/attendance-review") =>
        {
            let Some(event_id) =
                path_uuid(path, "/api/v1/attendance/events/", "/attendance-review")
            else {
                return Response::problem(
                    400,
                    "Bad Request",
                    "Bad Request",
                    "eventId must be a UUID",
                );
            };
            match event_attendance_review(
                pool,
                event_id,
                &authenticated_subject,
                request.method == "POST",
            )
            .await
            {
                Ok(review) => Response::json(200, "OK", &review),
                Err(error) => check_in_error(error),
            }
        }
        ("GET", _)
            if path.starts_with("/api/v1/attendance/events/")
                && path.ends_with("/organizer-action") =>
        {
            let Some(event_id) = path_uuid(path, "/api/v1/attendance/events/", "/organizer-action")
            else {
                return Response::problem(
                    400,
                    "Bad Request",
                    "Bad Request",
                    "eventId must be a UUID",
                );
            };
            match get_organizer_action_info(pool, event_id, &authenticated_subject).await {
                Ok(info) => Response::json(200, "OK", &info),
                Err(_) => Response::problem(
                    503,
                    "Service Unavailable",
                    "Service Unavailable",
                    "Attendance is unavailable",
                ),
            }
        }
        ("POST", _) if path.starts_with("/api/v1/attendance/events/") && path.ends_with("/qr") => {
            let Some(event_id) = path_uuid(path, "/api/v1/attendance/events/", "/qr") else {
                return Response::problem(
                    400,
                    "Bad Request",
                    "Bad Request",
                    "eventId must be a UUID",
                );
            };
            match issue_event_qr_for_creator(pool, event_id, &authenticated_subject).await {
                Ok(qr) => Response::json(200, "OK", &qr),
                Err(error) => check_in_error(error),
            }
        }
        ("POST", _) if path.starts_with("/api/v1/attendance/tickets/") && path.ends_with("/qr") => {
            let Some(event_id) = path_uuid(path, "/api/v1/attendance/tickets/", "/qr") else {
                return Response::problem(
                    400,
                    "Bad Request",
                    "Bad Request",
                    "eventId must be a UUID",
                );
            };
            match issue_participant_qr(pool, event_id, &authenticated_subject).await {
                Ok(qr) => Response::json(200, "OK", &qr),
                Err(error) => check_in_error(error),
            }
        }
        _ if path == "/api/v1/attendance/me"
            || path == "/api/v1/attendance/check-ins"
            || path == "/api/v1/attendance/tickets/me"
            || path.starts_with("/api/v1/attendance/events/")
            || path.starts_with("/api/v1/attendance/tickets/")
            || path.starts_with("/api/v1/attendance/organizer-check-ins/") =>
        {
            method_not_allowed()
        }
        _ => Response::problem(404, "Not Found", "Not Found", "Route not found"),
    }
}

fn path_uuid(path: &str, prefix: &str, suffix: &str) -> Option<Uuid> {
    path.strip_prefix(prefix)?
        .strip_suffix(suffix)?
        .parse()
        .ok()
}

fn invalid_qr_request() -> Response {
    Response::problem(400, "Bad Request", "Bad Request", "A QR token is required")
}

fn check_in_error(error: CheckInError) -> Response {
    match error {
        CheckInError::InvalidToken => {
            Response::problem(403, "Forbidden", "Forbidden", "QR token is invalid")
        }
        CheckInError::SessionUnavailable => Response::problem(
            409,
            "Conflict",
            "Conflict",
            "Attendance session is closed or unavailable",
        ),
        CheckInError::OutsideWindow => Response::problem(
            409,
            "Conflict",
            "Conflict",
            "Check-in is outside the allowed window",
        ),
        CheckInError::NotEligible => Response::problem(
            403,
            "Forbidden",
            "Forbidden",
            "Participant is not eligible for this event",
        ),
        CheckInError::EntryUnavailable => Response::problem(
            409,
            "Conflict",
            "Conflict",
            "Attendance entry is not eligible",
        ),
        CheckInError::NotEventCreator => Response::problem(
            403,
            "Forbidden",
            "Forbidden",
            "Only the recorded event creator can manage attendance",
        ),
        CheckInError::Database(_) => Response::problem(
            503,
            "Service Unavailable",
            "Service Unavailable",
            "Check-in could not be saved",
        ),
    }
}

fn bearer_token(headers: &[(String, String)]) -> Option<&str> {
    headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("authorization"))
        .and_then(|(_, value)| {
            let (scheme, token) = value.split_once(' ')?;
            (scheme.eq_ignore_ascii_case("bearer") && !token.trim().is_empty())
                .then_some(token.trim())
        })
}

fn query_parameter<'a>(path: &'a str, name: &str) -> Option<&'a str> {
    path.split_once('?')?.1.split('&').find_map(|parameter| {
        let (key, value) = parameter.split_once('=')?;
        (key == name).then_some(value)
    })
}

fn method_not_allowed() -> Response {
    Response::problem(
        405,
        "Method Not Allowed",
        "Method Not Allowed",
        "Method not allowed",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    #[test]
    fn parses_http_request_with_body_and_authorization_header() {
        let bytes = b"POST /api/v1/attendance/check-ins HTTP/1.1\r\nAuthorization: Bearer token\r\nContent-Length: 14\r\n\r\n{\"token\":\"qr\"}";
        let end = find_header_end(bytes).unwrap();
        let request = parse_request(bytes, end).unwrap();
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api/v1/attendance/check-ins");
        assert_eq!(bearer_token(&request.headers), Some("token"));
        assert_eq!(
            serde_json::from_slice::<CheckInRequest>(&request.body)
                .unwrap()
                .token,
            "qr"
        );
    }

    #[test]
    fn query_parser_reads_event_id_without_changing_identity_source() {
        assert_eq!(
            query_parameter("/api/v1/attendance/me?eventId=abc&page=0", "eventId"),
            Some("abc")
        );
    }

    #[tokio::test]
    async fn rejects_malformed_bearer_jwt_before_accessing_the_database() {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://unir:unir-test@127.0.0.1:1/unir_access")
            .unwrap();
        let verifier = JwtVerifier::new(
            "http://localhost/realms/unir".to_string(),
            "http://127.0.0.1:1/jwks".to_string(),
        );
        let request = HttpRequest {
            method: "POST".to_string(),
            path: "/api/v1/attendance/check-ins".to_string(),
            headers: vec![("Authorization".to_string(), "Bearer malformed".to_string())],
            body: br#"{"token":"qr"}"#.to_vec(),
        };

        let response = route_request(&pool, &verifier, &request).await;
        assert_eq!(response.status, 401);
        assert!(response.body.contains("invalid or expired"));
    }
}

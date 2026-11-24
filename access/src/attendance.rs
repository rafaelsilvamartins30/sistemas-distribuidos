use futures_util::StreamExt;
use lapin::{
    options::{
        BasicAckOptions, BasicConsumeOptions, BasicNackOptions, BasicQosOptions,
        BasicRejectOptions, ExchangeDeclareOptions, QueueBindOptions, QueueDeclareOptions,
    },
    types::FieldTable,
    Connection, ConnectionProperties, ExchangeKind,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPool, Postgres, Row, Transaction};
use std::{error::Error, fmt};
use time::OffsetDateTime;
use tokio::time::{sleep, Duration};
use uuid::Uuid;

pub const EXCHANGE: &str = "unir.events";
pub const QUEUE: &str = "access.registration-confirmed";
pub const ROUTING_KEY: &str = "engagement.registration.confirmed.v1";
pub const EVENT_CANCELLED_ROUTING_KEY: &str = "engagement.event.cancelled.v1";
pub const REGISTRATION_CANCELLED_ROUTING_KEY: &str = "engagement.registration.cancelled.v1";

const EVENT_TYPE: &str = "RegistrationConfirmed";
const AGGREGATE_TYPE: &str = "Registration";
const EVENT_CANCELLED_TYPE: &str = "EventCancelled";
const EVENT_AGGREGATE_TYPE: &str = "Event";
const REGISTRATION_CANCELLED_TYPE: &str = "RegistrationCancelled";
const REGISTRATION_AGGREGATE_TYPE: &str = "Registration";
const SESSION_SOURCE_TYPE: &str = "EVENT";
const PARTICIPANT_SCANS_EVENT: &str = "PARTICIPANT_SCANS_EVENT";
const ORGANIZER_SCANS_PARTICIPANT: &str = "ORGANIZER_SCANS_PARTICIPANT";

#[derive(Debug)]
pub enum ProcessError {
    Invalid(String),
    Database(sqlx::Error),
}

impl fmt::Display for ProcessError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(reason) => {
                write!(formatter, "invalid RegistrationConfirmed v1: {reason}")
            }
            Self::Database(error) => write!(
                formatter,
                "could not persist RegistrationConfirmed: {error}"
            ),
        }
    }
}

impl Error for ProcessError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Invalid(_) => None,
            Self::Database(error) => Some(error),
        }
    }
}

impl From<sqlx::Error> for ProcessError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

#[derive(Debug)]
pub enum CheckInError {
    InvalidToken,
    SessionUnavailable,
    OutsideWindow,
    NotEligible,
    EntryUnavailable,
    NotEventCreator,
    Database(sqlx::Error),
}

impl fmt::Display for CheckInError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidToken => write!(formatter, "INVALID_QR_TOKEN"),
            Self::SessionUnavailable => write!(formatter, "ATTENDANCE_SESSION_UNAVAILABLE"),
            Self::OutsideWindow => write!(formatter, "CHECK_IN_WINDOW_CLOSED"),
            Self::NotEligible => write!(formatter, "ATTENDANCE_NOT_ELIGIBLE"),
            Self::EntryUnavailable => write!(formatter, "ATTENDANCE_ENTRY_NOT_ELIGIBLE"),
            Self::NotEventCreator => write!(formatter, "EVENT_CREATOR_REQUIRED"),
            Self::Database(error) => write!(formatter, "could not persist check-in: {error}"),
        }
    }
}

impl Error for CheckInError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Database(error) => Some(error),
            _ => None,
        }
    }
}

impl From<sqlx::Error> for CheckInError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInResult {
    pub check_in_id: Uuid,
    pub session_id: Uuid,
    pub attendance_entry_id: Uuid,
    pub status: String,
    #[serde(with = "time::serde::rfc3339")]
    pub checked_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyAttendance {
    pub event_id: Uuid,
    pub session_id: Uuid,
    pub attendance_entry_id: Uuid,
    pub status: String,
    pub action: Option<ParticipantAction>,
    #[serde(with = "time::serde::rfc3339")]
    pub registered_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    pub checked_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyTicket {
    pub event_id: Uuid,
    pub registration_id: Option<Uuid>,
    pub session_id: Uuid,
    pub attendance_entry_id: Uuid,
    pub event_title: String,
    #[serde(with = "time::serde::rfc3339")]
    pub starts_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub ends_at: OffsetDateTime,
    pub mode: String,
    pub status: String,
    pub action: Option<ParticipantAction>,
    #[serde(with = "time::serde::rfc3339")]
    pub registered_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    pub checked_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrArtifact {
    pub token: String,
    pub qr_svg: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizerCheckInPreview {
    pub event_id: Uuid,
    pub event_title: String,
    pub attendance_entry_id: Uuid,
    pub registration_id: Option<Uuid>,
    pub participant_user_id: String,
    pub status: String,
}

fn shared_token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

fn qr_artifact(token: String) -> Result<QrArtifact, CheckInError> {
    let qr = qrcodegen::QrCode::encode_text(&token, qrcodegen::QrCodeEcc::Medium)
        .map_err(|_| CheckInError::SessionUnavailable)?;
    let border = 4;
    let dimension = qr.size() + border * 2;
    let mut path = String::new();
    for y in 0..qr.size() {
        for x in 0..qr.size() {
            if qr.get_module(x, y) {
                path.push_str(&format!("M{} {}h1v1h-1z", x + border, y + border));
            }
        }
    }
    Ok(QrArtifact {
        token,
        qr_svg: format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {dimension} {dimension}\" shape-rendering=\"crispEdges\"><rect width=\"100%\" height=\"100%\" fill=\"white\"/><path d=\"{path}\"/></svg>"
        ),
    })
}

fn new_qr_token() -> String {
    // UUID v4 is backed by the operating system CSPRNG; two UUIDs provide 244 random bits.
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

async fn finalize_expired_tickets(pool: &PgPool) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    let now = OffsetDateTime::now_utc();
    sqlx::query(
        "UPDATE attendance_sessions SET status = 'CLOSED' \
         WHERE status = 'OPEN' AND ends_at < $1",
    )
    .bind(now)
    .execute(&mut *transaction)
    .await?;
    sqlx::query(
        "UPDATE attendance_entries entries SET status = 'NO_SHOW', finalized_at = $1 \
         FROM attendance_sessions sessions \
         WHERE entries.session_id = sessions.id AND entries.status = 'ELIGIBLE' \
           AND sessions.status = 'CLOSED' AND sessions.ends_at < $1",
    )
    .bind(now)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await
}

/// Lists this user's attendance tickets, finalizing expired eligible entries as no-shows.
pub async fn get_my_tickets(pool: &PgPool, user_id: &str) -> Result<Vec<MyTicket>, sqlx::Error> {
    finalize_expired_tickets(pool).await?;
    let rows = sqlx::query(
        "SELECT sessions.source_id AS event_id, entries.registration_id, sessions.id AS session_id, \
         entries.id AS attendance_entry_id, sessions.source_title AS event_title, sessions.starts_at, \
         sessions.ends_at, sessions.mode, sessions.status AS session_status, entries.status, entries.registered_at, check_ins.checked_at \
         FROM attendance_sessions sessions \
         JOIN attendance_entries entries ON entries.session_id = sessions.id \
         LEFT JOIN check_ins ON check_ins.attendance_entry_id = entries.id \
         WHERE sessions.source_type = $1 AND entries.user_id = $2 \
         ORDER BY sessions.starts_at DESC, entries.registered_at DESC",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            Ok(MyTicket {
                event_id: row.try_get("event_id")?,
                registration_id: row.try_get("registration_id")?,
                session_id: row.try_get("session_id")?,
                attendance_entry_id: row.try_get("attendance_entry_id")?,
                event_title: row.try_get("event_title")?,
                starts_at: row.try_get("starts_at")?,
                ends_at: row.try_get("ends_at")?,
                mode: row.try_get("mode")?,
                status: row.try_get("status")?,
                action: participant_action(
                    row.try_get("mode")?,
                    row.try_get("session_status")?,
                    row.try_get("status")?,
                ),
                registered_at: row.try_get("registered_at")?,
                checked_at: row.try_get("checked_at")?,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ParticipantAction {
    ScanEventQr,
    GenerateParticipantQr,
}

fn participant_action(
    mode: &str,
    session_status: &str,
    entry_status: &str,
) -> Option<ParticipantAction> {
    match (mode, session_status, entry_status) {
        (PARTICIPANT_SCANS_EVENT, "OPEN", "ELIGIBLE") => Some(ParticipantAction::ScanEventQr),
        (ORGANIZER_SCANS_PARTICIPANT, "OPEN", "ELIGIBLE") => {
            Some(ParticipantAction::GenerateParticipantQr)
        }
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrganizerAction {
    GenerateEventQr,
    ScanParticipantQr,
    ReviewAttendance,
}

fn organizer_action(
    owner_id: Option<&str>,
    user_id: &str,
    mode: &str,
    status: &str,
) -> Result<OrganizerAction, CheckInError> {
    if owner_id != Some(user_id) {
        return Err(CheckInError::NotEventCreator);
    }
    match (mode, status) {
        (PARTICIPANT_SCANS_EVENT, "OPEN") => Ok(OrganizerAction::GenerateEventQr),
        (ORGANIZER_SCANS_PARTICIPANT, "OPEN") => Ok(OrganizerAction::ScanParticipantQr),
        _ => Err(CheckInError::SessionUnavailable),
    }
}

pub async fn get_organizer_action(
    pool: &PgPool,
    event_id: Uuid,
    user_id: &str,
) -> Result<Option<OrganizerAction>, sqlx::Error> {
    let session = sqlx::query(
        "SELECT event_creator_user_id, mode, status, check_in_closes_at FROM attendance_sessions \
         WHERE source_type = $1 AND source_id = $2",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(event_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = session else {
        return Ok(None);
    };
    let owner: Option<String> = row.try_get("event_creator_user_id")?;
    let status: &str = row.try_get("status")?;
    let ends: OffsetDateTime = row.try_get("check_in_closes_at")?;
    if owner.as_deref() == Some(user_id)
        && status != "CANCELLED"
        && OffsetDateTime::now_utc() > ends
    {
        return Ok(Some(OrganizerAction::ReviewAttendance));
    }
    Ok(organizer_action(owner.as_deref(), user_id, row.try_get("mode")?, status).ok())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceReview {
    entries: Vec<AttendanceReviewEntry>,
    #[serde(with = "time::serde::rfc3339::option")]
    closed_at: Option<OffsetDateTime>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AttendanceReviewEntry {
    user_id: String,
    #[serde(with = "time::serde::rfc3339")]
    checked_in_at: OffsetDateTime,
}

pub async fn event_attendance_review(
    pool: &PgPool,
    event_id: Uuid,
    subject: &str,
    close: bool,
) -> Result<AttendanceReview, CheckInError> {
    let mut tx = pool.begin().await?;
    let session = sqlx::query(
        "SELECT id, event_creator_user_id, status, check_in_closes_at, attendance_reviewed_at \
         FROM attendance_sessions WHERE source_type = $1 AND source_id = $2 FOR UPDATE",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(event_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(CheckInError::SessionUnavailable)?;
    let owner: Option<String> = session.try_get("event_creator_user_id")?;
    if owner.as_deref() != Some(subject) {
        return Err(CheckInError::NotEventCreator);
    }
    let status: &str = session.try_get("status")?;
    let ends: OffsetDateTime = session.try_get("check_in_closes_at")?;
    let now = OffsetDateTime::now_utc();
    if status == "CANCELLED" || (close && now <= ends) {
        return Err(CheckInError::SessionUnavailable);
    }

    let id: Uuid = session.try_get("id")?;
    let mut closed_at: Option<OffsetDateTime> = session.try_get("attendance_reviewed_at")?;
    if close && closed_at.is_none() {
        let recorded_at: OffsetDateTime = sqlx::query_scalar(
            "UPDATE attendance_sessions SET status = 'CLOSED', shared_token_hash = NULL, attendance_reviewed_at = $2 WHERE id = $1 RETURNING attendance_reviewed_at",
        )
        .bind(id)
        .bind(now)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE attendance_entries SET status = 'NO_SHOW', finalized_at = $2 WHERE session_id = $1 AND status = 'ELIGIBLE'",
        )
        .bind(id)
        .bind(recorded_at)
        .execute(&mut *tx)
        .await?;
        closed_at = Some(recorded_at);
    }
    let rows: Vec<(String, OffsetDateTime)> = sqlx::query_as(
        "SELECT e.user_id, c.checked_at FROM check_ins c JOIN attendance_entries e ON e.id = c.attendance_entry_id \
         WHERE c.session_id = $1 ORDER BY c.checked_at, e.id",
    ).bind(id).fetch_all(&mut *tx).await?;
    tx.commit().await?;
    let entries = rows
        .into_iter()
        .map(|(user_id, checked_in_at)| AttendanceReviewEntry {
            user_id,
            checked_in_at,
        })
        .collect();
    Ok(AttendanceReview { entries, closed_at })
}

/// Issues the event QR to its recorded creator. Only its hash is stored.
pub async fn issue_event_qr_for_creator(
    pool: &PgPool,
    event_id: Uuid,
    user_id: &str,
) -> Result<QrArtifact, CheckInError> {
    let mut transaction = pool.begin().await?;
    let row = sqlx::query(
        "SELECT id, mode, status, event_creator_user_id, check_in_closes_at FROM attendance_sessions \
         WHERE source_type = $1 AND source_id = $2 FOR UPDATE",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(event_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(CheckInError::SessionUnavailable)?;
    let session_id: Uuid = row.try_get("id")?;
    let mode: String = row.try_get("mode")?;
    let status: String = row.try_get("status")?;
    let owner_id: Option<String> = row.try_get("event_creator_user_id")?;
    if organizer_action(owner_id.as_deref(), user_id, &mode, &status)?
        != OrganizerAction::GenerateEventQr
    {
        return Err(CheckInError::SessionUnavailable);
    }
    let ends: OffsetDateTime = row.try_get("check_in_closes_at")?;
    if OffsetDateTime::now_utc() > ends {
        return Err(CheckInError::OutsideWindow);
    }
    let token = new_qr_token();
    sqlx::query("UPDATE attendance_sessions SET shared_token_hash = $2 WHERE id = $1")
        .bind(session_id)
        .bind(shared_token_hash(&token))
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    qr_artifact(token)
}

/// Issues the participant's QR for organizer-scanned events; each new QR invalidates the prior one.
pub async fn issue_participant_qr(
    pool: &PgPool,
    event_id: Uuid,
    user_id: &str,
) -> Result<QrArtifact, CheckInError> {
    let mut transaction = pool.begin().await?;
    let row = sqlx::query(
        "SELECT sessions.id AS session_id, sessions.mode, sessions.status, sessions.check_in_closes_at, entries.id AS entry_id, \
         entries.status AS entry_status \
         FROM attendance_sessions sessions JOIN attendance_entries entries ON entries.session_id = sessions.id \
         WHERE sessions.source_type = $1 AND sessions.source_id = $2 AND entries.user_id = $3 \
         ORDER BY entries.registered_at DESC LIMIT 1 FOR UPDATE OF sessions, entries",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(event_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(CheckInError::NotEligible)?;
    let ends: OffsetDateTime = row.try_get("check_in_closes_at")?;
    if OffsetDateTime::now_utc() > ends {
        return Err(CheckInError::OutsideWindow);
    }
    let mode: String = row.try_get("mode")?;
    let session_status: String = row.try_get("status")?;
    let entry_status: String = row.try_get("entry_status")?;
    let entry_id: Uuid = row.try_get("entry_id")?;
    if mode != ORGANIZER_SCANS_PARTICIPANT || session_status != "OPEN" {
        return Err(CheckInError::SessionUnavailable);
    }
    if entry_status != "ELIGIBLE" {
        return Err(CheckInError::EntryUnavailable);
    }
    let token = new_qr_token();
    sqlx::query("UPDATE attendance_entries SET participant_token_hash = $2 WHERE id = $1")
        .bind(entry_id)
        .bind(shared_token_hash(&token))
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    qr_artifact(token)
}

/// Validates the organizer and ticket, but does not mark attendance.
pub async fn preview_organizer_check_in(
    pool: &PgPool,
    token: &str,
    organizer_user_id: &str,
) -> Result<OrganizerCheckInPreview, CheckInError> {
    let row = sqlx::query(
        "SELECT sessions.source_id AS event_id, sessions.source_title AS event_title, sessions.mode, \
         sessions.status AS session_status, sessions.event_creator_user_id, sessions.check_in_opens_at, \
         sessions.check_in_closes_at, entries.id AS entry_id, entries.registration_id, entries.user_id, \
         entries.status AS entry_status \
         FROM attendance_sessions sessions JOIN attendance_entries entries ON entries.session_id = sessions.id \
         WHERE entries.participant_token_hash = $1",
    )
    .bind(shared_token_hash(token))
    .fetch_optional(pool)
    .await?
    .ok_or(CheckInError::InvalidToken)?;
    validate_organizer_scan(&row, organizer_user_id)?;
    Ok(OrganizerCheckInPreview {
        event_id: row.try_get("event_id")?,
        event_title: row.try_get("event_title")?,
        attendance_entry_id: row.try_get("entry_id")?,
        registration_id: row.try_get("registration_id")?,
        participant_user_id: row.try_get("user_id")?,
        status: row.try_get("entry_status")?,
    })
}

fn validate_organizer_scan(
    row: &sqlx::postgres::PgRow,
    organizer_user_id: &str,
) -> Result<(), CheckInError> {
    let owner_id: Option<String> = row.try_get("event_creator_user_id")?;
    let mode: String = row.try_get("mode")?;
    let session_status: String = row.try_get("session_status")?;
    let opens_at: OffsetDateTime = row.try_get("check_in_opens_at")?;
    let closes_at: OffsetDateTime = row.try_get("check_in_closes_at")?;
    let entry_status: String = row.try_get("entry_status")?;
    if organizer_action(
        owner_id.as_deref(),
        organizer_user_id,
        &mode,
        &session_status,
    )? != OrganizerAction::ScanParticipantQr
    {
        return Err(CheckInError::SessionUnavailable);
    }
    let now = OffsetDateTime::now_utc();
    if now < opens_at || now > closes_at {
        return Err(CheckInError::OutsideWindow);
    }
    if entry_status != "ELIGIBLE" && entry_status != "ATTENDED" {
        return Err(CheckInError::EntryUnavailable);
    }
    Ok(())
}

/// Confirms attendance only after the event owner explicitly approves the scan.
pub async fn confirm_organizer_check_in(
    pool: &PgPool,
    token: &str,
    organizer_user_id: &str,
) -> Result<CheckInResult, CheckInError> {
    let mut transaction = pool.begin().await?;
    let row = sqlx::query(
        "SELECT sessions.id AS session_id, sessions.mode, \
         sessions.status AS session_status, sessions.event_creator_user_id, sessions.check_in_opens_at, \
         sessions.check_in_closes_at, entries.id AS entry_id, entries.user_id, \
         entries.status AS entry_status, check_ins.id AS check_in_id, check_ins.checked_at \
         FROM attendance_sessions sessions JOIN attendance_entries entries ON entries.session_id = sessions.id \
         LEFT JOIN check_ins ON check_ins.attendance_entry_id = entries.id \
         WHERE entries.participant_token_hash = $1 FOR UPDATE OF sessions, entries",
    )
    .bind(shared_token_hash(token))
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(CheckInError::InvalidToken)?;
    validate_organizer_scan(&row, organizer_user_id)?;
    let session_id: Uuid = row.try_get("session_id")?;
    let entry_id: Uuid = row.try_get("entry_id")?;
    let entry_status: String = row.try_get("entry_status")?;
    if entry_status == "ATTENDED" {
        let check_in_id: Option<Uuid> = row.try_get("check_in_id")?;
        let checked_at: Option<OffsetDateTime> = row.try_get("checked_at")?;
        let result = CheckInResult {
            check_in_id: check_in_id.ok_or(CheckInError::EntryUnavailable)?,
            session_id,
            attendance_entry_id: entry_id,
            status: "ATTENDED".to_string(),
            checked_at: checked_at.ok_or(CheckInError::EntryUnavailable)?,
        };
        transaction.commit().await?;
        return Ok(result);
    }
    let checked_at = OffsetDateTime::now_utc();
    let check_in_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO check_ins (id, session_id, attendance_entry_id, method, validated_by_user_id, checked_at) \
         VALUES ($1, $2, $3, 'ORGANIZER_SCANS_PARTICIPANT', $4, $5)",
    )
    .bind(check_in_id)
    .bind(session_id)
    .bind(entry_id)
    .bind(organizer_user_id)
    .bind(checked_at)
    .execute(&mut *transaction)
    .await?;
    sqlx::query(
        "UPDATE attendance_entries SET status = 'ATTENDED', attended_at = $2 \
         WHERE id = $1 AND status = 'ELIGIBLE'",
    )
    .bind(entry_id)
    .bind(checked_at)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    Ok(CheckInResult {
        check_in_id,
        session_id,
        attendance_entry_id: entry_id,
        status: "ATTENDED".to_string(),
        checked_at,
    })
}

/// Records the authenticated participant's check-in under the session row lock.
/// Repeated requests for an already checked-in user return the original CheckIn.
pub async fn record_participant_check_in(
    pool: &PgPool,
    token: &str,
    user_id: &str,
) -> Result<CheckInResult, CheckInError> {
    if token.trim().is_empty() || user_id.trim().is_empty() || user_id.len() > 255 {
        return Err(CheckInError::InvalidToken);
    }

    let mut transaction = pool.begin().await?;
    let row = sqlx::query(
        "SELECT id, mode, status, check_in_opens_at, check_in_closes_at \
         FROM attendance_sessions WHERE shared_token_hash = $1 FOR UPDATE",
    )
    .bind(shared_token_hash(token))
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(CheckInError::InvalidToken)?;

    let session_id: Uuid = row.try_get("id")?;
    let mode: String = row.try_get("mode")?;
    let status: String = row.try_get("status")?;
    let opens_at: OffsetDateTime = row.try_get("check_in_opens_at")?;
    let closes_at: OffsetDateTime = row.try_get("check_in_closes_at")?;
    if mode != PARTICIPANT_SCANS_EVENT || status != "OPEN" {
        return Err(CheckInError::SessionUnavailable);
    }

    let checked_at = OffsetDateTime::now_utc();
    if checked_at < opens_at || checked_at > closes_at {
        return Err(CheckInError::OutsideWindow);
    }

    if let Some(existing) = sqlx::query(
        "SELECT c.id, c.session_id, c.attendance_entry_id, c.checked_at \
         FROM check_ins c JOIN attendance_entries e ON e.id = c.attendance_entry_id \
         WHERE c.session_id = $1 AND e.user_id = $2",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?
    {
        let result = CheckInResult {
            check_in_id: existing.try_get("id")?,
            session_id: existing.try_get("session_id")?,
            attendance_entry_id: existing.try_get("attendance_entry_id")?,
            status: "ATTENDED".to_string(),
            checked_at: existing.try_get("checked_at")?,
        };
        transaction.commit().await?;
        return Ok(result);
    }

    let entry = sqlx::query(
        "SELECT id, status FROM attendance_entries WHERE session_id = $1 AND user_id = $2 \
         ORDER BY registered_at DESC LIMIT 1 FOR UPDATE",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(CheckInError::NotEligible)?;
    let entry_id: Uuid = entry.try_get("id")?;
    let entry_status: String = entry.try_get("status")?;
    if entry_status != "ELIGIBLE" {
        return Err(CheckInError::EntryUnavailable);
    }

    let check_in_id = Uuid::new_v4();
    let inserted = sqlx::query(
        "INSERT INTO check_ins (id, session_id, attendance_entry_id, method, validated_by_user_id, checked_at) \
         VALUES ($1, $2, $3, $4, NULL, $5) RETURNING checked_at",
    )
    .bind(check_in_id)
    .bind(session_id)
    .bind(entry_id)
    .bind(PARTICIPANT_SCANS_EVENT)
    .bind(checked_at)
    .fetch_one(&mut *transaction)
    .await?;
    let persisted_checked_at: OffsetDateTime = inserted.try_get("checked_at")?;

    let updated = sqlx::query(
        "UPDATE attendance_entries SET status = 'ATTENDED', attended_at = $2 \
         WHERE id = $1 AND status = 'ELIGIBLE'",
    )
    .bind(entry_id)
    .bind(persisted_checked_at)
    .execute(&mut *transaction)
    .await?;
    if updated.rows_affected() != 1 {
        return Err(CheckInError::EntryUnavailable);
    }

    transaction.commit().await?;
    Ok(CheckInResult {
        check_in_id,
        session_id,
        attendance_entry_id: entry_id,
        status: "ATTENDED".to_string(),
        checked_at: persisted_checked_at,
    })
}

/// Returns the authenticated user's persisted attendance state for an event.
pub async fn get_my_attendance(
    pool: &PgPool,
    event_id: Uuid,
    user_id: &str,
) -> Result<Option<MyAttendance>, sqlx::Error> {
    finalize_expired_tickets(pool).await?;
    let row = sqlx::query(
        "SELECT s.source_id AS event_id, s.id AS session_id, e.id AS attendance_entry_id, \
         s.mode, s.status AS session_status, e.status, e.registered_at, c.checked_at \
         FROM attendance_sessions s JOIN attendance_entries e ON e.session_id = s.id \
         LEFT JOIN check_ins c ON c.attendance_entry_id = e.id \
         WHERE s.source_type = $1 AND s.source_id = $2 AND e.user_id = $3 \
         ORDER BY e.registered_at DESC LIMIT 1",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(event_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    row.map(|row| {
        Ok(MyAttendance {
            event_id: row.try_get("event_id")?,
            session_id: row.try_get("session_id")?,
            attendance_entry_id: row.try_get("attendance_entry_id")?,
            status: row.try_get("status")?,
            action: participant_action(
                row.try_get("mode")?,
                row.try_get("session_status")?,
                row.try_get("status")?,
            ),
            registered_at: row.try_get("registered_at")?,
            checked_at: row.try_get("checked_at")?,
        })
    })
    .transpose()
}

/// Issues a new shared QR token for an event and invalidates any previous token.
/// Only the token hash is persisted; the returned plaintext is displayed once by the CLI.
pub async fn issue_event_qr_token(pool: &PgPool, event_id: Uuid) -> Result<String, CheckInError> {
    let mut transaction = pool.begin().await?;
    let row = sqlx::query(
        "SELECT id, mode, status FROM attendance_sessions \
         WHERE source_type = $1 AND source_id = $2 FOR UPDATE",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(event_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(CheckInError::SessionUnavailable)?;
    let session_id: Uuid = row.try_get("id")?;
    let mode: String = row.try_get("mode")?;
    let status: String = row.try_get("status")?;
    if mode != PARTICIPANT_SCANS_EVENT || status != "OPEN" {
        return Err(CheckInError::SessionUnavailable);
    }

    let token = new_qr_token();
    sqlx::query("UPDATE attendance_sessions SET shared_token_hash = $2 WHERE id = $1")
        .bind(session_id)
        .bind(shared_token_hash(&token))
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(token)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
    message_id: Uuid,
    event_type: String,
    aggregate_type: String,
    aggregate_id: Uuid,
    #[serde(with = "time::serde::rfc3339")]
    occurred_at: OffsetDateTime,
    schema_version: i32,
    payload_json: Value,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RegistrationConfirmed {
    registration_id: Uuid,
    event_id: Uuid,
    user_id: String,
    attendance_enabled: bool,
    attendance_mode: Option<AttendanceMode>,
    event_title: String,
    #[serde(with = "time::serde::rfc3339")]
    starts_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    ends_at: OffsetDateTime,
    #[serde(default)]
    event_creator_user_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum AttendanceMode {
    ParticipantScansEvent,
    OrganizerScansParticipant,
}

impl AttendanceMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::ParticipantScansEvent => "PARTICIPANT_SCANS_EVENT",
            Self::OrganizerScansParticipant => "ORGANIZER_SCANS_PARTICIPANT",
        }
    }
}

struct ValidatedMessage {
    envelope: Envelope,
    payload: RegistrationConfirmed,
    payload_hash: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventCancelledEnvelope {
    message_id: Uuid,
    event_type: String,
    aggregate_type: String,
    aggregate_id: Uuid,
    #[serde(with = "time::serde::rfc3339")]
    occurred_at: OffsetDateTime,
    schema_version: i32,
    payload_json: Value,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventCancelled {
    event_id: Uuid,
    #[serde(with = "time::serde::rfc3339")]
    cancelled_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RegistrationCancelledEnvelope {
    message_id: Uuid,
    event_type: String,
    aggregate_type: String,
    aggregate_id: Uuid,
    #[serde(with = "time::serde::rfc3339")]
    occurred_at: OffsetDateTime,
    schema_version: i32,
    payload_json: Value,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RegistrationCancelled {
    registration_id: Uuid,
    event_id: Uuid,
    user_id: String,
    #[serde(with = "time::serde::rfc3339")]
    cancelled_at: OffsetDateTime,
}

struct ValidatedCancellation {
    envelope: EventCancelledEnvelope,
    payload: EventCancelled,
    payload_hash: String,
}

fn decode_message(body: &[u8]) -> Result<ValidatedMessage, ProcessError> {
    let envelope: Envelope = serde_json::from_slice(body)
        .map_err(|error| ProcessError::Invalid(format!("invalid envelope JSON: {error}")))?;
    if envelope.message_id.is_nil()
        || envelope.event_type != EVENT_TYPE
        || envelope.aggregate_type != AGGREGATE_TYPE
        || envelope.aggregate_id.is_nil()
        || envelope.schema_version != 1
    {
        return Err(ProcessError::Invalid(
            "unsupported envelope identity or version".into(),
        ));
    }

    let payload: RegistrationConfirmed = serde_json::from_value(envelope.payload_json.clone())
        .map_err(|error| ProcessError::Invalid(format!("invalid payload JSON: {error}")))?;
    if payload.registration_id.is_nil()
        || payload.event_id.is_nil()
        || payload.registration_id != envelope.aggregate_id
        || payload.user_id.trim().is_empty()
        || payload.user_id.len() > 255
        || payload.event_title.trim().is_empty()
        || payload.event_title.chars().count() > 200
        || payload.ends_at <= payload.starts_at
        || payload
            .event_creator_user_id
            .as_ref()
            .is_some_and(|owner| owner.trim().is_empty() || owner.len() > 255)
        || (payload.attendance_enabled && payload.attendance_mode.is_none())
    {
        return Err(ProcessError::Invalid(
            "payload fields are inconsistent or incomplete".into(),
        ));
    }

    let serialized = serde_json::to_vec(&payload)
        .map_err(|error| ProcessError::Invalid(format!("could not normalize payload: {error}")))?;
    let payload_hash = format!("{:x}", Sha256::digest(serialized));
    Ok(ValidatedMessage {
        envelope,
        payload,
        payload_hash,
    })
}

pub async fn process_message(pool: &PgPool, body: &[u8]) -> Result<(), ProcessError> {
    let header: Value = serde_json::from_slice(body)
        .map_err(|error| ProcessError::Invalid(format!("invalid envelope JSON: {error}")))?;
    match header.get("eventType").and_then(Value::as_str) {
        Some(EVENT_TYPE) => process_registration_confirmed(pool, body).await,
        Some(EVENT_CANCELLED_TYPE) => process_event_cancelled(pool, body).await,
        Some(REGISTRATION_CANCELLED_TYPE) => process_registration_cancelled(pool, body).await,
        _ => Err(ProcessError::Invalid(
            "unsupported Access event type".into(),
        )),
    }
}

async fn process_registration_cancelled(pool: &PgPool, body: &[u8]) -> Result<(), ProcessError> {
    let envelope: RegistrationCancelledEnvelope = serde_json::from_slice(body)
        .map_err(|error| ProcessError::Invalid(format!("invalid envelope JSON: {error}")))?;
    let payload: RegistrationCancelled = serde_json::from_value(envelope.payload_json.clone())
        .map_err(|error| ProcessError::Invalid(format!("invalid payload JSON: {error}")))?;
    if envelope.message_id.is_nil()
        || envelope.event_type != REGISTRATION_CANCELLED_TYPE
        || envelope.aggregate_type != REGISTRATION_AGGREGATE_TYPE
        || envelope.aggregate_id != payload.registration_id
        || envelope.schema_version != 1
        || payload.registration_id.is_nil()
        || payload.event_id.is_nil()
        || payload.user_id.trim().is_empty()
        || payload.user_id.len() > 255
        || payload.cancelled_at < envelope.occurred_at
    {
        return Err(ProcessError::Invalid(
            "unsupported cancellation identity or inconsistent payload".into(),
        ));
    }
    let mut transaction = pool.begin().await?;
    let session = sqlx::query(
        "SELECT id FROM attendance_sessions WHERE source_type = $1 AND source_id = $2 FOR UPDATE",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(payload.event_id)
    .fetch_optional(&mut *transaction)
    .await?;
    if let Some(session) = session {
        let session_id: Uuid = session.try_get("id")?;
        sqlx::query(
            "UPDATE attendance_entries SET status = 'CANCELLED', cancelled_at = $2, \
             participant_token_hash = NULL \
             WHERE session_id = $1 AND registration_id = $3 AND user_id = $4 AND status = 'ELIGIBLE'",
        )
        .bind(session_id)
        .bind(payload.cancelled_at)
        .bind(payload.registration_id)
        .bind(&payload.user_id)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(())
}

async fn process_registration_confirmed(pool: &PgPool, body: &[u8]) -> Result<(), ProcessError> {
    let message = decode_message(body)?;
    let mut transaction = pool.begin().await?;

    if !message.payload.attendance_enabled {
        transaction.commit().await?;
        return Ok(());
    }

    let event_cancelled = lock_event_state(
        &mut transaction,
        message.payload.event_id,
        message.envelope.occurred_at,
    )
    .await?;

    if let Some(row) = sqlx::query(
        "SELECT registration_id, payload_hash FROM processed_messages WHERE message_id = $1",
    )
    .bind(message.envelope.message_id)
    .fetch_optional(&mut *transaction)
    .await?
    {
        let existing_registration_id: Uuid = row.try_get("registration_id")?;
        let existing_hash: String = row.try_get("payload_hash")?;
        if existing_registration_id != message.payload.registration_id
            || existing_hash != message.payload_hash
        {
            return Err(ProcessError::Invalid(
                "messageId was reused with different content".into(),
            ));
        }
        transaction.commit().await?;
        return Ok(());
    }

    let claimed = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO processed_registrations (registration_id, payload_hash, processed_at) \
         VALUES ($1, $2, $3) ON CONFLICT (registration_id) DO NOTHING RETURNING registration_id",
    )
    .bind(message.payload.registration_id)
    .bind(&message.payload_hash)
    .bind(message.envelope.occurred_at)
    .fetch_optional(&mut *transaction)
    .await?;

    if claimed.is_none() {
        let existing_hash = sqlx::query_scalar::<_, String>(
            "SELECT payload_hash FROM processed_registrations WHERE registration_id = $1 FOR UPDATE",
        )
        .bind(message.payload.registration_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or_else(|| ProcessError::Invalid("registration idempotency record disappeared".into()))?;
        if existing_hash != message.payload_hash {
            return Err(ProcessError::Invalid(
                "registrationId was reused with different attendance data".into(),
            ));
        }
        record_processed_message(&mut transaction, &message).await?;
        transaction.commit().await?;
        return Ok(());
    }

    if event_cancelled {
        record_processed_message(&mut transaction, &message).await?;
        transaction.commit().await?;
        return Ok(());
    }

    let session_id = ensure_session(&mut transaction, &message).await?;
    let entry_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO attendance_entries (id, session_id, registration_id, user_id, status, registered_at) \
         VALUES ($1, $2, $3, $4, 'ELIGIBLE', $5)",
    )
    .bind(entry_id)
    .bind(session_id)
    .bind(message.payload.registration_id)
    .bind(&message.payload.user_id)
    .bind(message.envelope.occurred_at)
    .execute(&mut *transaction)
    .await?;
    sqlx::query(
        "UPDATE processed_registrations SET attendance_entry_id = $1 WHERE registration_id = $2",
    )
    .bind(entry_id)
    .bind(message.payload.registration_id)
    .execute(&mut *transaction)
    .await?;
    record_processed_message(&mut transaction, &message).await?;
    transaction.commit().await?;
    Ok(())
}

async fn lock_event_state(
    transaction: &mut Transaction<'_, Postgres>,
    event_id: Uuid,
    created_at: OffsetDateTime,
) -> Result<bool, ProcessError> {
    sqlx::query(
        "INSERT INTO attendance_event_states (event_id, status, created_at) \
         VALUES ($1, 'ACTIVE', $2) ON CONFLICT (event_id) DO NOTHING",
    )
    .bind(event_id)
    .bind(created_at)
    .execute(&mut **transaction)
    .await?;
    let status: String = sqlx::query_scalar(
        "SELECT status FROM attendance_event_states WHERE event_id = $1 FOR UPDATE",
    )
    .bind(event_id)
    .fetch_one(&mut **transaction)
    .await?;
    Ok(status == "CANCELLED")
}

fn decode_event_cancelled(body: &[u8]) -> Result<ValidatedCancellation, ProcessError> {
    let envelope: EventCancelledEnvelope = serde_json::from_slice(body).map_err(|error| {
        ProcessError::Invalid(format!("invalid EventCancelled envelope JSON: {error}"))
    })?;
    if envelope.message_id.is_nil()
        || envelope.event_type != EVENT_CANCELLED_TYPE
        || envelope.aggregate_type != EVENT_AGGREGATE_TYPE
        || envelope.aggregate_id.is_nil()
        || envelope.schema_version != 1
    {
        return Err(ProcessError::Invalid(
            "unsupported EventCancelled envelope identity or version".into(),
        ));
    }
    let payload: EventCancelled =
        serde_json::from_value(envelope.payload_json.clone()).map_err(|error| {
            ProcessError::Invalid(format!("invalid EventCancelled payload JSON: {error}"))
        })?;
    if payload.event_id.is_nil()
        || payload.event_id != envelope.aggregate_id
        || payload.cancelled_at > envelope.occurred_at
    {
        return Err(ProcessError::Invalid(
            "inconsistent EventCancelled payload".into(),
        ));
    }
    let serialized = serde_json::to_vec(&payload).map_err(|error| {
        ProcessError::Invalid(format!(
            "could not normalize EventCancelled payload: {error}"
        ))
    })?;
    let payload_hash = format!("{:x}", Sha256::digest(serialized));
    Ok(ValidatedCancellation {
        envelope,
        payload,
        payload_hash,
    })
}

#[cfg(test)]
fn cancellation_message(event_id: Uuid, message_id: Uuid) -> Vec<u8> {
    serde_json::json!({
        "messageId": message_id,
        "eventType": EVENT_CANCELLED_TYPE,
        "aggregateType": EVENT_AGGREGATE_TYPE,
        "aggregateId": event_id,
        "occurredAt": "2026-11-16T15:00:00Z",
        "schemaVersion": 1,
        "payloadJson": {
            "eventId": event_id,
            "cancelledAt": "2026-11-16T15:00:00Z"
        }
    })
    .to_string()
    .into_bytes()
}

pub async fn process_event_cancelled(pool: &PgPool, body: &[u8]) -> Result<(), ProcessError> {
    let cancellation = decode_event_cancelled(body)?;
    let mut transaction = pool.begin().await?;
    sqlx::query(
        "INSERT INTO attendance_event_states \
         (event_id, status, created_at) \
         VALUES ($1, 'ACTIVE', $2) ON CONFLICT (event_id) DO NOTHING",
    )
    .bind(cancellation.payload.event_id)
    .bind(cancellation.envelope.occurred_at)
    .execute(&mut *transaction)
    .await?;

    let row = sqlx::query(
        "SELECT status, cancellation_message_id, cancellation_hash FROM attendance_event_states \
         WHERE event_id = $1 FOR UPDATE",
    )
    .bind(cancellation.payload.event_id)
    .fetch_one(&mut *transaction)
    .await?;
    let status: String = row.try_get("status")?;
    let existing_message_id: Option<Uuid> = row.try_get("cancellation_message_id")?;
    let existing_hash: Option<String> = row.try_get("cancellation_hash")?;
    if status == "CANCELLED" {
        if existing_message_id != Some(cancellation.envelope.message_id)
            || existing_hash.as_deref() != Some(cancellation.payload_hash.as_str())
        {
            return Err(ProcessError::Invalid(
                "event already has a different cancellation message".into(),
            ));
        }
        transaction.commit().await?;
        return Ok(());
    }

    sqlx::query(
        "UPDATE attendance_event_states SET status = 'CANCELLED', cancellation_message_id = $2, \
         cancellation_hash = $3, cancelled_at = $4 WHERE event_id = $1",
    )
    .bind(cancellation.payload.event_id)
    .bind(cancellation.envelope.message_id)
    .bind(&cancellation.payload_hash)
    .bind(cancellation.payload.cancelled_at)
    .execute(&mut *transaction)
    .await?;
    sqlx::query(
        "UPDATE attendance_sessions SET status = 'CANCELLED', shared_token_hash = NULL, cancelled_at = $2 \
         WHERE source_type = $1 AND source_id = $3 AND status <> 'CANCELLED'",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(cancellation.payload.cancelled_at)
    .bind(cancellation.payload.event_id)
    .execute(&mut *transaction)
    .await?;
    sqlx::query(
        "UPDATE attendance_entries SET status = 'CANCELLED', cancelled_at = $2 \
         WHERE session_id IN (SELECT id FROM attendance_sessions WHERE source_type = $1 AND source_id = $3) \
           AND status = 'ELIGIBLE'",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(cancellation.payload.cancelled_at)
    .bind(cancellation.payload.event_id)
    .execute(&mut *transaction)
    .await?;
    sqlx::query(
        "UPDATE attendance_entries SET participant_token_hash = NULL \
         WHERE session_id IN (SELECT id FROM attendance_sessions WHERE source_type = $1 AND source_id = $2)",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(cancellation.payload.event_id)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    Ok(())
}

async fn ensure_session(
    transaction: &mut Transaction<'_, Postgres>,
    message: &ValidatedMessage,
) -> Result<Uuid, ProcessError> {
    let mode = message.payload.attendance_mode.ok_or_else(|| {
        ProcessError::Invalid("attendanceMode is required when attendance is enabled".into())
    })?;
    let candidate_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO attendance_sessions \
         (id, source_type, source_id, source_title, starts_at, ends_at, mode, status, event_creator_user_id, \
          check_in_opens_at, check_in_closes_at, shared_token_hash, created_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $5, $6, NULL, $9) \
         ON CONFLICT (source_type, source_id) DO NOTHING",
    )
    .bind(candidate_id)
    .bind(SESSION_SOURCE_TYPE)
    .bind(message.payload.event_id)
    .bind(&message.payload.event_title)
    .bind(message.payload.starts_at)
    .bind(message.payload.ends_at)
    .bind(mode.as_str())
    .bind(&message.payload.event_creator_user_id)
    .bind(message.envelope.occurred_at)
    .execute(&mut **transaction)
    .await?;

    let row = sqlx::query(
        "SELECT id, source_title, starts_at, ends_at, mode, event_creator_user_id FROM attendance_sessions \
         WHERE source_type = $1 AND source_id = $2",
    )
    .bind(SESSION_SOURCE_TYPE)
    .bind(message.payload.event_id)
    .fetch_one(&mut **transaction)
    .await?;
    let session_id: Uuid = row.try_get("id")?;
    let source_title: String = row.try_get("source_title")?;
    let starts_at: OffsetDateTime = row.try_get("starts_at")?;
    let ends_at: OffsetDateTime = row.try_get("ends_at")?;
    let stored_mode: String = row.try_get("mode")?;
    let stored_owner_id: Option<String> = row.try_get("event_creator_user_id")?;
    if source_title != message.payload.event_title
        || starts_at.unix_timestamp_nanos() / 1_000
            != message.payload.starts_at.unix_timestamp_nanos() / 1_000
        || ends_at.unix_timestamp_nanos() / 1_000
            != message.payload.ends_at.unix_timestamp_nanos() / 1_000
        || stored_mode != mode.as_str()
        || stored_owner_id
            .as_ref()
            .zip(message.payload.event_creator_user_id.as_ref())
            .is_some_and(|(stored, incoming)| stored != incoming)
    {
        return Err(ProcessError::Invalid(
            "event attendance data differs from the existing session".into(),
        ));
    }
    if stored_owner_id.is_none() && message.payload.event_creator_user_id.is_some() {
        sqlx::query("UPDATE attendance_sessions SET event_creator_user_id = $2 WHERE id = $1")
            .bind(session_id)
            .bind(&message.payload.event_creator_user_id)
            .execute(&mut **transaction)
            .await?;
    }
    Ok(session_id)
}

async fn record_processed_message(
    transaction: &mut Transaction<'_, Postgres>,
    message: &ValidatedMessage,
) -> Result<(), ProcessError> {
    let inserted = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO processed_messages (message_id, registration_id, payload_hash, processed_at) \
         VALUES ($1, $2, $3, $4) ON CONFLICT (message_id) DO NOTHING RETURNING message_id",
    )
    .bind(message.envelope.message_id)
    .bind(message.payload.registration_id)
    .bind(&message.payload_hash)
    .bind(message.envelope.occurred_at)
    .fetch_optional(&mut **transaction)
    .await?;
    if inserted.is_none() {
        let row = sqlx::query(
            "SELECT registration_id, payload_hash FROM processed_messages WHERE message_id = $1",
        )
        .bind(message.envelope.message_id)
        .fetch_one(&mut **transaction)
        .await?;
        let registration_id: Uuid = row.try_get("registration_id")?;
        let payload_hash: String = row.try_get("payload_hash")?;
        if registration_id != message.payload.registration_id
            || payload_hash != message.payload_hash
        {
            return Err(ProcessError::Invalid(
                "messageId was reused with different content".into(),
            ));
        }
    }
    Ok(())
}

pub async fn run_consumer(pool: PgPool, rabbitmq_url: String) {
    let mut retry_delay = Duration::from_secs(1);
    loop {
        match consume_once(&pool, &rabbitmq_url).await {
            Ok(()) => eprintln!("Access RabbitMQ consumer stopped; reconnecting"),
            Err(error) => eprintln!("Access RabbitMQ consumer unavailable: {error}"),
        }
        sleep(retry_delay).await;
        retry_delay = (retry_delay * 2).min(Duration::from_secs(30));
    }
}

async fn consume_once(
    pool: &PgPool,
    rabbitmq_url: &str,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let connection = Connection::connect(rabbitmq_url, ConnectionProperties::default()).await?;
    let channel = connection.create_channel().await?;
    channel
        .exchange_declare(
            EXCHANGE.into(),
            ExchangeKind::Topic,
            ExchangeDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await?;
    channel.basic_qos(1, BasicQosOptions::default()).await?;
    channel
        .queue_declare(
            QUEUE.into(),
            QueueDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await?;
    channel
        .queue_bind(
            QUEUE.into(),
            EXCHANGE.into(),
            ROUTING_KEY.into(),
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;
    channel
        .queue_bind(
            QUEUE.into(),
            EXCHANGE.into(),
            EVENT_CANCELLED_ROUTING_KEY.into(),
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;
    channel
        .queue_bind(
            QUEUE.into(),
            EXCHANGE.into(),
            REGISTRATION_CANCELLED_ROUTING_KEY.into(),
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;
    let mut consumer = channel
        .basic_consume(
            QUEUE.into(),
            "access-registration-confirmed".into(),
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;

    while let Some(delivery) = consumer.next().await {
        let delivery = delivery?;
        match process_message(pool, &delivery.data).await {
            Ok(()) => {
                delivery.ack(BasicAckOptions::default()).await?;
            }
            Err(ProcessError::Invalid(reason)) => {
                eprintln!(
                    "Rejecting invalid RegistrationConfirmed {}: {reason}",
                    delivery.delivery_tag
                );
                delivery
                    .reject(BasicRejectOptions { requeue: false })
                    .await?;
            }
            Err(ProcessError::Database(error)) => {
                eprintln!(
                    "RegistrationConfirmed {} could not commit; requeueing: {error}",
                    delivery.delivery_tag
                );
                sleep(Duration::from_secs(1)).await;
                delivery
                    .nack(BasicNackOptions {
                        multiple: false,
                        requeue: true,
                    })
                    .await?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn envelope(payload: Value) -> Value {
        json!({
            "messageId": "2ae1fc3b-ea4e-45ba-a5d2-8a583138a7e0",
            "eventType": EVENT_TYPE,
            "aggregateType": AGGREGATE_TYPE,
            "aggregateId": "c264db58-2b89-4ae3-bc2b-94da25b0693b",
            "occurredAt": "2026-11-16T15:00:00Z",
            "schemaVersion": 1,
            "payloadJson": payload
        })
    }

    fn payload(attendance_enabled: bool) -> Value {
        json!({
            "registrationId": "c264db58-2b89-4ae3-bc2b-94da25b0693b",
            "eventId": "e07f7cd3-b13f-4b17-9284-96f33e37b942",
            "userId": "keycloak-subject",
            "attendanceEnabled": attendance_enabled,
            "attendanceMode": "PARTICIPANT_SCANS_EVENT",
            "eventTitle": "Encontro de Boas-vindas",
            "startsAt": "2027-06-15T17:00:00Z",
            "endsAt": "2027-06-15T19:00:00Z"
        })
    }

    #[test]
    fn decodes_attendance_enabled_contract_and_keeps_keycloak_subject() {
        let message = decode_message(envelope(payload(true)).to_string().as_bytes()).unwrap();
        assert!(message.payload.attendance_enabled);
        assert_eq!(message.payload.user_id, "keycloak-subject");
        assert_eq!(
            message.payload.attendance_mode,
            Some(AttendanceMode::ParticipantScansEvent)
        );
    }

    #[test]
    fn accepts_disabled_attendance_without_creating_an_attendance_mode_requirement() {
        let mut disabled = payload(false);
        disabled["attendanceMode"] = Value::Null;
        let message = decode_message(envelope(disabled).to_string().as_bytes()).unwrap();
        assert!(!message.payload.attendance_enabled);
    }

    #[test]
    fn rejects_wrong_schema_and_payload_registration_mismatch() {
        let mut wrong_version = envelope(payload(true));
        wrong_version["schemaVersion"] = json!(2);
        assert!(matches!(
            decode_message(wrong_version.to_string().as_bytes()),
            Err(ProcessError::Invalid(_))
        ));

        let mut mismatched = payload(true);
        mismatched["registrationId"] = json!("a18a5f64-c834-47e1-9248-1167cedb41aa");
        assert!(matches!(
            decode_message(envelope(mismatched).to_string().as_bytes()),
            Err(ProcessError::Invalid(_))
        ));
    }

    #[test]
    fn rejects_missing_attendance_mode_when_presence_is_enabled() {
        let mut missing_mode = payload(true);
        missing_mode["attendanceMode"] = Value::Null;
        assert!(matches!(
            decode_message(envelope(missing_mode).to_string().as_bytes()),
            Err(ProcessError::Invalid(_))
        ));
    }

    #[test]
    fn creates_an_svg_qr_artifact() {
        let artifact = qr_artifact("attendance-token".into()).unwrap();
        assert_eq!(artifact.token, "attendance-token");
        assert!(artifact
            .qr_svg
            .starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\""));
        assert!(artifact.qr_svg.contains("<path d=\"M"));
        assert!(artifact.qr_svg.ends_with("</svg>"));
    }

    #[test]
    fn decodes_event_cancellation_and_rejects_wrong_aggregate() {
        let event_id = Uuid::new_v4();
        let message =
            decode_event_cancelled(&cancellation_message(event_id, Uuid::new_v4())).unwrap();
        assert_eq!(message.payload.event_id, event_id);

        let mut malformed: Value =
            serde_json::from_slice(&cancellation_message(event_id, Uuid::new_v4())).unwrap();
        malformed["aggregateType"] = json!("Registration");
        assert!(matches!(
            decode_event_cancelled(malformed.to_string().as_bytes()),
            Err(ProcessError::Invalid(_))
        ));
    }
}

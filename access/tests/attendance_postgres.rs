use access::attendance::{
    get_my_attendance, issue_event_qr_token, process_message, record_participant_check_in,
    CheckInError,
};
use chrono::{Duration as ChronoDuration, Utc};
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{env, time::Duration};
use uuid::Uuid;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

async fn test_pool() -> PgPool {
    let url = env::var("ACCESS_TEST_DATABASE_URL")
        .expect("ACCESS_TEST_DATABASE_URL is required for the PostgreSQL integration suite");
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await
        .unwrap();
    MIGRATOR.run(&pool).await.unwrap();
    pool
}

fn message(registration_id: Uuid, event_id: Uuid, message_id: Uuid, enabled: bool) -> Vec<u8> {
    json!({
        "messageId": message_id,
        "eventType": "RegistrationConfirmed",
        "aggregateType": "Registration",
        "aggregateId": registration_id,
        "occurredAt": "2026-11-16T15:00:00Z",
        "schemaVersion": 1,
        "payloadJson": {
            "registrationId": registration_id,
            "eventId": event_id,
            "userId": format!("kc-{registration_id}"),
            "attendanceEnabled": enabled,
            "attendanceMode": if enabled { json!("PARTICIPANT_SCANS_EVENT") } else { Value::Null },
            "eventTitle": "Evento de teste",
            "startsAt": "2027-06-15T17:00:00Z",
            "endsAt": "2027-06-15T19:00:00Z"
        }
    })
    .to_string()
    .into_bytes()
}

async fn cleanup(pool: &PgPool, registration_id: Uuid, event_id: Uuid) {
    sqlx::query("DELETE FROM processed_messages WHERE registration_id = $1")
        .bind(registration_id)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM processed_registrations WHERE registration_id = $1")
        .bind(registration_id)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM check_ins WHERE session_id IN (SELECT id FROM attendance_sessions WHERE source_id = $1)")
        .bind(event_id)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "DELETE FROM attendance_entries WHERE session_id IN \
                 (SELECT id FROM attendance_sessions WHERE source_id = $1)",
    )
    .bind(event_id)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("DELETE FROM attendance_sessions WHERE source_id = $1")
        .bind(event_id)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM attendance_event_states WHERE event_id = $1")
        .bind(event_id)
        .execute(pool)
        .await
        .unwrap();
}

async fn check_in_fixture(pool: &PgPool, user_id: &str) -> (Uuid, Uuid) {
    let event_id = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    let entry_id = Uuid::new_v4();
    let now = Utc::now();
    let starts_at = now - ChronoDuration::minutes(5);
    let ends_at = now + ChronoDuration::hours(1);
    sqlx::query(
        "INSERT INTO attendance_sessions \
         (id, source_type, source_id, source_title, starts_at, ends_at, mode, status, \
          check_in_opens_at, check_in_closes_at, created_at) \
         VALUES ($1, 'EVENT', $2, 'Check-in PostgreSQL test', $3, $4, \
                 'PARTICIPANT_SCANS_EVENT', 'OPEN', $3, $4, $5)",
    )
    .bind(session_id)
    .bind(event_id)
    .bind(starts_at)
    .bind(ends_at)
    .bind(now)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO attendance_entries (id, session_id, user_id, status, registered_at) \
         VALUES ($1, $2, $3, 'ELIGIBLE', $4)",
    )
    .bind(entry_id)
    .bind(session_id)
    .bind(user_id)
    .bind(now)
    .execute(pool)
    .await
    .unwrap();
    (event_id, entry_id)
}

fn event_cancelled(event_id: Uuid, message_id: Uuid) -> Vec<u8> {
    json!({
        "messageId": message_id,
        "eventType": "EventCancelled",
        "aggregateType": "Event",
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

#[tokio::test]
#[ignore = "requires ACCESS_TEST_DATABASE_URL pointing to an isolated PostgreSQL database"]
async fn repeated_message_and_registration_create_one_session_and_one_eligible_entry() {
    let pool = test_pool().await;
    let registration_id = Uuid::new_v4();
    let event_id = Uuid::new_v4();
    let message_id = Uuid::new_v4();
    let original = message(registration_id, event_id, message_id, true);
    let same_registration_new_delivery = message(registration_id, event_id, Uuid::new_v4(), true);

    process_message(&pool, &original).await.unwrap();
    process_message(&pool, &original).await.unwrap();
    process_message(&pool, &same_registration_new_delivery)
        .await
        .unwrap();

    let sessions: i64 =
        sqlx::query_scalar("SELECT count(*) FROM attendance_sessions WHERE source_id = $1")
            .bind(event_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let entry = sqlx::query(
        "SELECT status, user_id FROM attendance_entries WHERE session_id = \
         (SELECT id FROM attendance_sessions WHERE source_id = $1)",
    )
    .bind(event_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let message_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM processed_messages WHERE registration_id = $1")
            .bind(registration_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(sessions, 1);
    assert_eq!(entry.get::<String, _>("status"), "ELIGIBLE");
    assert!(entry.get::<String, _>("user_id").starts_with("kc-"));
    assert_eq!(message_count, 2);
    let window: (chrono::DateTime<Utc>, chrono::DateTime<Utc>) = sqlx::query_as(
        "SELECT check_in_opens_at, check_in_closes_at FROM attendance_sessions WHERE source_id = $1",
    )
    .bind(event_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(window.0.to_rfc3339(), "2027-06-15T17:00:00+00:00");
    assert_eq!(window.1.to_rfc3339(), "2027-06-15T19:00:00+00:00");
    cleanup(&pool, registration_id, event_id).await;
}

#[tokio::test]
#[ignore = "requires ACCESS_TEST_DATABASE_URL pointing to an isolated PostgreSQL database"]
async fn concurrent_duplicate_scan_creates_one_check_in_and_marks_entry_attended() {
    let pool = test_pool().await;
    let user_id = format!("kc-{}", Uuid::new_v4());
    let (event_id, entry_id) = check_in_fixture(&pool, &user_id).await;
    let first_token = issue_event_qr_token(&pool, event_id).await.unwrap();
    let first_hash: String = sqlx::query_scalar(
        "SELECT shared_token_hash FROM attendance_sessions WHERE source_id = $1",
    )
    .bind(event_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_ne!(first_hash, first_token);
    assert_eq!(first_hash.len(), 64);

    let replacement = issue_event_qr_token(&pool, event_id).await.unwrap();
    assert_ne!(first_token, replacement);
    assert!(matches!(
        record_participant_check_in(&pool, &first_token, &user_id).await,
        Err(CheckInError::InvalidToken)
    ));

    let (left, right) = tokio::join!(
        record_participant_check_in(&pool, &replacement, &user_id),
        record_participant_check_in(&pool, &replacement, &user_id)
    );
    let left = left.unwrap();
    let right = right.unwrap();
    assert_eq!(left.check_in_id, right.check_in_id);
    assert_eq!(left.checked_at, right.checked_at);
    assert_eq!(left.attendance_entry_id, entry_id);
    assert_eq!(left.status, "ATTENDED");

    let check_ins: i64 = sqlx::query_scalar("SELECT count(*) FROM check_ins WHERE session_id = $1")
        .bind(left.session_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    let status: String = sqlx::query_scalar("SELECT status FROM attendance_entries WHERE id = $1")
        .bind(entry_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    let attendance = get_my_attendance(&pool, event_id, &user_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(check_ins, 1);
    assert_eq!(status, "ATTENDED");
    assert_eq!(attendance.status, "ATTENDED");
    assert_eq!(attendance.checked_at, Some(left.checked_at));
    cleanup(&pool, Uuid::nil(), event_id).await;
}

#[tokio::test]
#[ignore = "requires ACCESS_TEST_DATABASE_URL pointing to an isolated PostgreSQL database"]
async fn check_in_rejects_invalid_token_non_eligible_user_and_cancelled_session() {
    let pool = test_pool().await;
    let user_id = format!("kc-{}", Uuid::new_v4());
    let (event_id, entry_id) = check_in_fixture(&pool, &user_id).await;
    let token = issue_event_qr_token(&pool, event_id).await.unwrap();

    assert!(matches!(
        record_participant_check_in(&pool, "invalid-qr", &user_id).await,
        Err(CheckInError::InvalidToken)
    ));
    assert!(matches!(
        record_participant_check_in(&pool, &token, "another-keycloak-sub").await,
        Err(CheckInError::NotEligible)
    ));

    sqlx::query("UPDATE attendance_entries SET status = 'CANCELLED' WHERE id = $1")
        .bind(entry_id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        record_participant_check_in(&pool, &token, &user_id).await,
        Err(CheckInError::EntryUnavailable)
    ));

    sqlx::query("UPDATE attendance_sessions SET status = 'CANCELLED' WHERE source_id = $1")
        .bind(event_id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        record_participant_check_in(&pool, &token, &user_id).await,
        Err(CheckInError::SessionUnavailable)
    ));
    cleanup(&pool, Uuid::nil(), event_id).await;
}

#[tokio::test]
#[ignore = "requires ACCESS_TEST_DATABASE_URL pointing to an isolated PostgreSQL database"]
async fn check_in_rejects_requests_outside_the_starts_at_ends_at_window() {
    let pool = test_pool().await;
    let user_id = format!("kc-{}", Uuid::new_v4());
    let (event_id, _) = check_in_fixture(&pool, &user_id).await;
    let token = issue_event_qr_token(&pool, event_id).await.unwrap();
    let opens_at = Utc::now() + ChronoDuration::hours(2);
    let closes_at = opens_at + ChronoDuration::hours(1);
    sqlx::query(
        "UPDATE attendance_sessions SET starts_at = $2, ends_at = $3, \
         check_in_opens_at = $2, check_in_closes_at = $3 WHERE source_id = $1",
    )
    .bind(event_id)
    .bind(opens_at)
    .bind(closes_at)
    .execute(&pool)
    .await
    .unwrap();

    assert!(matches!(
        record_participant_check_in(&pool, &token, &user_id).await,
        Err(CheckInError::OutsideWindow)
    ));
    cleanup(&pool, Uuid::nil(), event_id).await;
}

#[tokio::test]
#[ignore = "requires ACCESS_TEST_DATABASE_URL pointing to an isolated PostgreSQL database"]
async fn disabled_attendance_commits_as_a_noop_without_access_records() {
    let pool = test_pool().await;
    let registration_id = Uuid::new_v4();
    let event_id = Uuid::new_v4();
    process_message(
        &pool,
        &message(registration_id, event_id, Uuid::new_v4(), false),
    )
    .await
    .unwrap();

    let sessions: i64 =
        sqlx::query_scalar("SELECT count(*) FROM attendance_sessions WHERE source_id = $1")
            .bind(event_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let entries: i64 =
        sqlx::query_scalar("SELECT count(*) FROM attendance_entries WHERE user_id = $1")
            .bind(format!("kc-{registration_id}"))
            .fetch_one(&pool)
            .await
            .unwrap();
    let processed: i64 =
        sqlx::query_scalar("SELECT count(*) FROM processed_messages WHERE registration_id = $1")
            .bind(registration_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(sessions, 0);
    assert_eq!(entries, 0);
    assert_eq!(processed, 0);
}

#[tokio::test]
#[ignore = "requires ACCESS_TEST_DATABASE_URL pointing to an isolated PostgreSQL database"]
async fn session_conflict_rolls_back_registration_idempotency_and_entry_writes() {
    let pool = test_pool().await;
    let registration_id = Uuid::new_v4();
    let event_id = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO attendance_sessions \
         (id, source_type, source_id, source_title, starts_at, ends_at, mode, status, \
          check_in_opens_at, check_in_closes_at, created_at) \
         VALUES ($1, 'EVENT', $2, 'Conflicting title', '2027-06-15T17:00:00Z', \
         '2027-06-15T19:00:00Z', 'PARTICIPANT_SCANS_EVENT', 'OPEN', \
         '2027-06-15T17:00:00Z', '2027-06-15T19:00:00Z', '2026-11-16T15:00:00Z')",
    )
    .bind(session_id)
    .bind(event_id)
    .execute(&pool)
    .await
    .unwrap();

    let error = process_message(
        &pool,
        &message(registration_id, event_id, Uuid::new_v4(), true),
    )
    .await
    .unwrap_err();
    assert!(matches!(
        error,
        access::attendance::ProcessError::Invalid(_)
    ));
    let registrations: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM processed_registrations WHERE registration_id = $1",
    )
    .bind(registration_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let messages: i64 =
        sqlx::query_scalar("SELECT count(*) FROM processed_messages WHERE registration_id = $1")
            .bind(registration_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let entries: i64 =
        sqlx::query_scalar("SELECT count(*) FROM attendance_entries WHERE session_id = $1")
            .bind(session_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(registrations, 0);
    assert_eq!(messages, 0);
    assert_eq!(entries, 0);
    sqlx::query("DELETE FROM attendance_sessions WHERE id = $1")
        .bind(session_id)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
#[ignore = "requires ACCESS_TEST_DATABASE_URL pointing to an isolated PostgreSQL database"]
async fn database_unavailability_is_reported_as_retryable() {
    let pool = PgPoolOptions::new()
        .acquire_timeout(Duration::from_secs(1))
        .connect_lazy("postgres://unir:unir-test@127.0.0.1:1/unir_access")
        .unwrap();
    let error = process_message(
        &pool,
        &message(Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4(), true),
    )
    .await
    .unwrap_err();
    assert!(matches!(
        error,
        access::attendance::ProcessError::Database(_)
    ));
}

#[tokio::test]
#[ignore = "requires ACCESS_TEST_DATABASE_URL pointing to an isolated PostgreSQL database"]
async fn event_cancellation_invalidates_eligible_entries_and_keeps_attendance_history() {
    let pool = test_pool().await;
    let event_id = Uuid::new_v4();
    let eligible_registration = Uuid::new_v4();
    let attended_registration = Uuid::new_v4();
    process_message(
        &pool,
        &message(eligible_registration, event_id, Uuid::new_v4(), true),
    )
    .await
    .unwrap();
    process_message(
        &pool,
        &message(attended_registration, event_id, Uuid::new_v4(), true),
    )
    .await
    .unwrap();
    sqlx::query(
        "UPDATE attendance_entries SET status = 'ATTENDED', attended_at = now() \
         WHERE session_id = (SELECT id FROM attendance_sessions WHERE source_id = $1) \
           AND user_id = $2",
    )
    .bind(event_id)
    .bind(format!("kc-{attended_registration}"))
    .execute(&pool)
    .await
    .unwrap();
    let cancellation_id = Uuid::new_v4();
    let cancellation = event_cancelled(event_id, cancellation_id);
    process_message(&pool, &cancellation).await.unwrap();
    process_message(&pool, &cancellation).await.unwrap();

    let session_status: String =
        sqlx::query_scalar("SELECT status FROM attendance_sessions WHERE source_id = $1")
            .bind(event_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let statuses: Vec<String> = sqlx::query_scalar(
        "SELECT status FROM attendance_entries WHERE session_id = \
         (SELECT id FROM attendance_sessions WHERE source_id = $1) ORDER BY user_id",
    )
    .bind(event_id)
    .fetch_all(&pool)
    .await
    .unwrap();
    let persisted_message: Uuid = sqlx::query_scalar(
        "SELECT cancellation_message_id FROM attendance_event_states WHERE event_id = $1",
    )
    .bind(event_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(session_status, "CANCELLED");
    assert_eq!(
        statuses
            .iter()
            .filter(|status| status.as_str() == "CANCELLED")
            .count(),
        1
    );
    assert_eq!(
        statuses
            .iter()
            .filter(|status| status.as_str() == "ATTENDED")
            .count(),
        1
    );
    assert_eq!(persisted_message, cancellation_id);
    sqlx::query("DELETE FROM processed_registrations WHERE registration_id = $1")
        .bind(attended_registration)
        .execute(&pool)
        .await
        .unwrap();
    cleanup(&pool, eligible_registration, event_id).await;
    sqlx::query("DELETE FROM processed_messages WHERE registration_id = $1")
        .bind(attended_registration)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
#[ignore = "requires ACCESS_TEST_DATABASE_URL pointing to an isolated PostgreSQL database"]
async fn delayed_registration_confirmed_cannot_reopen_cancelled_attendance() {
    let pool = test_pool().await;
    let registration_id = Uuid::new_v4();
    let event_id = Uuid::new_v4();
    process_message(&pool, &event_cancelled(event_id, Uuid::new_v4()))
        .await
        .unwrap();
    process_message(
        &pool,
        &message(registration_id, event_id, Uuid::new_v4(), true),
    )
    .await
    .unwrap();

    let sessions: i64 =
        sqlx::query_scalar("SELECT count(*) FROM attendance_sessions WHERE source_id = $1")
            .bind(event_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let entries: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM attendance_entries WHERE session_id IN \
         (SELECT id FROM attendance_sessions WHERE source_id = $1)",
    )
    .bind(event_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let processed_entry: Option<Uuid> = sqlx::query_scalar(
        "SELECT attendance_entry_id FROM processed_registrations WHERE registration_id = $1",
    )
    .bind(registration_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(sessions, 0);
    assert_eq!(entries, 0);
    assert_eq!(processed_entry, None);
    cleanup(&pool, registration_id, event_id).await;
}

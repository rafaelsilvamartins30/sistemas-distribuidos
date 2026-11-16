package br.unir.engagement.service;

import br.unir.engagement.dto.IntegrationEventEnvelope;
import br.unir.engagement.dto.RefundFailedPayload;
import br.unir.engagement.dto.RefundSucceededPayload;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefundResultService {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public RefundResultService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this(jdbcTemplate, objectMapper, Clock.systemUTC());
    }

    RefundResultService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper.copy();
        this.clock = clock;
    }

    @Transactional
    public void consume(byte[] body) {
        IntegrationEventEnvelope envelope = this.decodeEnvelope(body);
        RefundResult result = this.decodeResult(envelope);
        String hash = sha256(body);

        List<RegistrationContext> registrations = this.jdbcTemplate.query(
                "SELECT event_id, status FROM registrations WHERE id = ? FOR UPDATE",
                (row, index) -> new RegistrationContext(row.getObject("event_id", UUID.class), row.getString("status")),
                result.registrationId());
        RegistrationContext registration = registrations.isEmpty() ? null : registrations.getFirst();

        List<CompensationCase> cases = this.jdbcTemplate.query("""
                SELECT registration_id, refund_request_message_id, refund_status
                FROM payment_compensation_cases WHERE charge_id = ? FOR UPDATE
                """,
                (row, index) -> new CompensationCase(row.getObject("registration_id", UUID.class),
                        row.getObject("refund_request_message_id", UUID.class), row.getString("refund_status")),
                result.chargeId());
        List<EventCancellationRefund> cancellations = this.jdbcTemplate.query("""
                SELECT event_id, cancellation_message_id, charge_id, refund_status
                FROM event_cancellation_refunds
                WHERE registration_id = ? AND (cancellation_message_id = ? OR charge_id = ?)
                FOR UPDATE
                """,
                (row, index) -> new EventCancellationRefund(row.getObject("event_id", UUID.class),
                        row.getObject("cancellation_message_id", UUID.class), row.getObject("charge_id", UUID.class),
                        row.getString("refund_status")),
                result.registrationId(), result.requestMessageId(), result.chargeId());
        CompensationCase compensationCase = cases.isEmpty() ? null : cases.getFirst();
        EventCancellationRefund cancellation = cancellations.isEmpty() ? null : cancellations.getFirst();
        UUID cancellationEventId = cancellation == null ? null : cancellation.eventId();
        boolean matchesCompensation = compensationCase != null
                && compensationCase.registrationId().equals(result.registrationId())
                && compensationCase.requestMessageId() != null
                && compensationCase.requestMessageId().equals(result.requestMessageId());
        boolean matchesCancellation = cancellation != null
                && (cancellation.requestMessageId().equals(result.requestMessageId())
                        || result.chargeId().equals(cancellation.chargeId()));
        if (!matchesCancellation && registration != null && "CANCELLED_BY_EVENT".equals(registration.status())
                && this.isEventCancellationMessage(result.registrationId(), result.requestMessageId())) {
            matchesCancellation = true;
            cancellationEventId = registration.eventId();
        }
        if (!matchesCompensation && !matchesCancellation) {
            throw new InvalidRefundResultMessageException("refund result does not match its request");
        }

        if (!this.markProcessed(envelope.messageId(), result, hash)) {
            return;
        }
        if ((compensationCase != null && "COMPLETED".equals(compensationCase.status()))
                || (cancellation != null && "COMPLETED".equals(cancellation.status()))) {
            return;
        }
        if (result instanceof RefundSuccess success) {
            this.complete(success, cancellationEventId);
        } else if (result instanceof RefundFailure failure) {
            this.fail(failure, cancellationEventId);
        }
    }

    private boolean isEventCancellationMessage(UUID registrationId, UUID messageId) {
        return Boolean.TRUE.equals(this.jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM outbox_events
                    WHERE id = ? AND aggregate_type = 'Registration' AND aggregate_id = ?
                      AND event_type = 'RegistrationCancelledByEvent'
                )
                """, Boolean.class, messageId, registrationId));
    }

    private IntegrationEventEnvelope decodeEnvelope(byte[] body) {
        try {
            IntegrationEventEnvelope envelope = this.objectMapper.readValue(body, IntegrationEventEnvelope.class);
            if (envelope.messageId() == null || envelope.occurredAt() == null || envelope.payloadJson() == null
                    || envelope.aggregateId() == null || !"Charge".equals(envelope.aggregateType())
                    || (!RefundSucceededPayload.EVENT_TYPE.equals(envelope.eventType())
                            && !RefundFailedPayload.EVENT_TYPE.equals(envelope.eventType()))
                    || envelope.schemaVersion() != 1) {
                throw new InvalidRefundResultMessageException("invalid refund result v1 envelope");
            }
            return envelope;
        } catch (IOException exception) {
            throw new InvalidRefundResultMessageException("invalid refund result envelope JSON", exception);
        }
    }

    private RefundResult decodeResult(IntegrationEventEnvelope envelope) {
        try {
            if (RefundSucceededPayload.EVENT_TYPE.equals(envelope.eventType())) {
                RefundSucceededPayload payload = this.objectMapper.treeToValue(envelope.payloadJson(),
                        RefundSucceededPayload.class);
                if (!validIds(envelope, payload.chargeId(), payload.registrationId(), payload.requestMessageId())
                        || payload.amountMinor() <= 0 || !RefundSucceededPayload.CURRENCY.equals(payload.currency())
                        || payload.refundedAt() == null) {
                    throw new InvalidRefundResultMessageException("invalid RefundSucceeded v1 payload");
                }
                return new RefundSuccess(payload.chargeId(), payload.registrationId(), payload.requestMessageId(),
                        payload.amountMinor(), payload.currency(), payload.refundedAt());
            }
            RefundFailedPayload payload = this.objectMapper.treeToValue(envelope.payloadJson(),
                    RefundFailedPayload.class);
            if (!validIds(envelope, payload.chargeId(), payload.registrationId(), payload.requestMessageId())
                    || payload.failureCode() == null || !payload.failureCode().matches("[A-Z0-9_]{1,64}")
                    || payload.failedAt() == null) {
                throw new InvalidRefundResultMessageException("invalid RefundFailed v1 payload");
            }
            return new RefundFailure(payload.chargeId(), payload.registrationId(), payload.requestMessageId(),
                    payload.failureCode(), payload.failedAt());
        } catch (JsonProcessingException exception) {
            throw new InvalidRefundResultMessageException("invalid refund result payload JSON", exception);
        }
    }

    private boolean markProcessed(UUID messageId, RefundResult result, String hash) {
        List<InboxRecord> existing = this.jdbcTemplate.query("""
                SELECT charge_id, registration_id, request_message_id, message_hash
                FROM processed_refund_results WHERE message_id = ?
                """,
                (row, index) -> new InboxRecord(row.getObject("charge_id", UUID.class),
                        row.getObject("registration_id", UUID.class), row.getObject("request_message_id", UUID.class),
                        row.getString("message_hash")),
                messageId);
        if (!existing.isEmpty()) {
            InboxRecord record = existing.getFirst();
            if (!record.chargeId().equals(result.chargeId()) || !record.registrationId().equals(result.registrationId())
                    || !record.requestMessageId().equals(result.requestMessageId()) || !record.hash().equals(hash)) {
                throw new InvalidRefundResultMessageException("messageId was reused with different refund data");
            }
            return false;
        }

        int inserted = this.jdbcTemplate.update("""
                INSERT INTO processed_refund_results (
                    message_id, charge_id, registration_id, request_message_id, message_hash, processed_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, messageId, result.chargeId(), result.registrationId(), result.requestMessageId(), hash,
                asUtcOffsetDateTime(Instant.now(this.clock)));
        if (inserted != 1) {
            throw new InvalidRefundResultMessageException("could not persist refund result deduplication");
        }
        return true;
    }

    private void complete(RefundSuccess success, UUID cancellationEventId) {
        OffsetDateTime completedAt = asUtcOffsetDateTime(success.refundedAt());
        OffsetDateTime updatedAt = asUtcOffsetDateTime(Instant.now(this.clock));
        int updated = this.jdbcTemplate.update("""
                UPDATE payment_compensation_cases
                SET refund_status = 'COMPLETED', refund_completed_at = ?, refund_failure_code = NULL, updated_at = ?
                WHERE charge_id = ? AND registration_id = ? AND refund_status <> 'COMPLETED'
                """, completedAt, updatedAt, success.chargeId(), success.registrationId());
        if (updated > 1) {
            throw new IllegalStateException("could not mark refund as completed");
        }
        int cancellationUpdated = this.jdbcTemplate.update("""
                UPDATE event_cancellation_refunds
                SET charge_id = ?, refund_status = 'COMPLETED', refund_completed_at = ?,
                    refund_failure_code = NULL, updated_at = ?
                WHERE registration_id = ? AND refund_status <> 'COMPLETED'
                  AND (cancellation_message_id = ? OR charge_id = ?)
                """, success.chargeId(), completedAt, updatedAt, success.registrationId(), success.requestMessageId(),
                success.chargeId());
        if (cancellationUpdated == 0 && cancellationEventId != null) {
            this.insertEventCancellationRefund(success.registrationId(), cancellationEventId,
                    success.requestMessageId(), success.chargeId(), "COMPLETED", completedAt, updatedAt, null);
        }
    }

    private void fail(RefundFailure failure, UUID cancellationEventId) {
        OffsetDateTime updatedAt = asUtcOffsetDateTime(Instant.now(this.clock));
        int updated = this.jdbcTemplate.update("""
                UPDATE payment_compensation_cases
                SET refund_status = 'FAILED', refund_failure_code = ?, updated_at = ?
                WHERE charge_id = ? AND registration_id = ? AND refund_status <> 'COMPLETED'
                """, failure.failureCode(), updatedAt, failure.chargeId(), failure.registrationId());
        if (updated > 1) {
            throw new IllegalStateException("could not mark refund as failed");
        }
        int cancellationUpdated = this.jdbcTemplate.update("""
                UPDATE event_cancellation_refunds
                SET charge_id = ?, refund_status = 'FAILED', refund_failure_code = ?, updated_at = ?
                WHERE registration_id = ? AND refund_status <> 'COMPLETED'
                  AND (cancellation_message_id = ? OR charge_id = ?)
                """, failure.chargeId(), failure.failureCode(), updatedAt, failure.registrationId(),
                failure.requestMessageId(), failure.chargeId());
        if (cancellationUpdated == 0 && cancellationEventId != null) {
            this.insertEventCancellationRefund(failure.registrationId(), cancellationEventId,
                    failure.requestMessageId(), failure.chargeId(), "FAILED", null, updatedAt, failure.failureCode());
        }
    }

    private void insertEventCancellationRefund(UUID registrationId, UUID eventId, UUID cancellationMessageId,
            UUID chargeId, String status, OffsetDateTime completedAt, OffsetDateTime updatedAt, String failureCode) {
        this.jdbcTemplate.update("""
                INSERT INTO event_cancellation_refunds (
                    registration_id, event_id, cancellation_message_id, charge_id, refund_status,
                    refund_completed_at, refund_failure_code, created_at, updated_at)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM event_cancellation_refunds WHERE registration_id = ?
                )
                """, registrationId, eventId, cancellationMessageId, chargeId, status, completedAt, failureCode,
                updatedAt, updatedAt, registrationId);
    }

    private static boolean validIds(IntegrationEventEnvelope envelope, UUID chargeId, UUID registrationId,
            UUID requestMessageId) {
        return chargeId != null && chargeId.equals(envelope.aggregateId()) && registrationId != null
                && requestMessageId != null;
    }

    private static OffsetDateTime asUtcOffsetDateTime(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }

    private static String sha256(byte[] body) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private sealed interface RefundResult permits RefundSuccess, RefundFailure {
        UUID chargeId();

        UUID registrationId();

        UUID requestMessageId();
    }

    private record RefundSuccess(UUID chargeId, UUID registrationId, UUID requestMessageId, long amountMinor,
            String currency, Instant refundedAt) implements RefundResult {
    }

    private record RefundFailure(UUID chargeId, UUID registrationId, UUID requestMessageId, String failureCode,
            Instant failedAt) implements RefundResult {
    }

    private record CompensationCase(UUID registrationId, UUID requestMessageId, String status) {
    }

    private record EventCancellationRefund(UUID eventId, UUID requestMessageId, UUID chargeId, String status) {
    }

    private record RegistrationContext(UUID eventId, String status) {
    }

    private record InboxRecord(UUID chargeId, UUID registrationId, UUID requestMessageId, String hash) {
    }
}

package br.unir.engagement.service;

import br.unir.engagement.dto.IntegrationEventEnvelope;
import br.unir.engagement.dto.PaymentConfirmedPayload;
import br.unir.engagement.dto.RefundRequestedPayload;
import br.unir.engagement.dto.RegistrationConfirmedPayload;
import br.unir.engagement.dto.RegistrationCancelledByEventPayload;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.Registration;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.entity.RegistrationStatus;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.repository.RegistrationRepository;
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
import java.util.Optional;
import java.util.UUID;
import com.fasterxml.jackson.core.JsonProcessingException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentConfirmationService {

    private final EventRepository eventRepository;
    private final RegistrationRepository registrationRepository;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final SportsParticipationService sportsParticipationService;

    @Autowired
    public PaymentConfirmationService(EventRepository eventRepository, RegistrationRepository registrationRepository,
            JdbcTemplate jdbcTemplate, ObjectMapper objectMapper,
            SportsParticipationService sportsParticipationService) {
        this(eventRepository, registrationRepository, jdbcTemplate, objectMapper, Clock.systemUTC(),
                sportsParticipationService);
    }

    PaymentConfirmationService(EventRepository eventRepository, RegistrationRepository registrationRepository,
            JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, Clock clock) {
        this(eventRepository, registrationRepository, jdbcTemplate, objectMapper, clock, null);
    }

    PaymentConfirmationService(EventRepository eventRepository, RegistrationRepository registrationRepository,
            JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, Clock clock,
            SportsParticipationService sportsParticipationService) {
        this.eventRepository = eventRepository;
        this.registrationRepository = registrationRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper.copy();
        this.clock = clock;
        this.sportsParticipationService = sportsParticipationService;
    }

    @Transactional
    public void consume(byte[] body) {
        IntegrationEventEnvelope envelope = decodeEnvelope(body);
        PaymentConfirmedPayload payload = decodePayload(envelope);
        String hash = sha256(body);

        Optional<UUID> eventId = this.registrationRepository.findEventIdById(payload.registrationId());
        Event event = null;
        Registration registration = null;
        if (eventId.isPresent()) {
            event = this.eventRepository.findByIdForUpdate(eventId.get())
                    .orElseThrow(() -> new IllegalStateException("Registration event is missing"));
            registration = this.registrationRepository.findByIdForUpdate(payload.registrationId()).orElse(null);
        }

        if (!this.markProcessed(envelope.messageId(), payload.registrationId(), payload.chargeId(), hash)) {
            return;
        }
        if (registration == null) {
            if (this.sportsParticipationService != null) {
                String compensationReason = this.sportsParticipationService.confirmSportsPayment(
                        payload.registrationId(), payload.eventId(), payload.userId(), payload.amountMinor(),
                        payload.paidAt());
                if (compensationReason == null) {
                    return;
                }
                this.recordCompensation(payload, envelope.messageId(), compensationReason);
                return;
            }
            this.recordCompensation(payload, envelope.messageId(), "REGISTRATION_NOT_FOUND");
            return;
        }

        String compensationReason = this.compensationReason(event, registration, payload);
        if (compensationReason != null) {
            if (compensationReason.equals("RESERVATION_EXPIRED")) {
                registration.expirePayment();
                this.registrationRepository.saveAndFlush(registration);
            }
            if (compensationReason.equals("EVENT_CANCELLED")) {
                this.trackEventCancellationRefund(payload, envelope.messageId());
            } else {
                this.recordCompensation(payload, envelope.messageId(), compensationReason);
            }
            return;
        }

        if (registration.getStatus() == RegistrationStatus.CONFIRMED) {
            return;
        }
        registration.confirmPayment(payload.paidAt());
        this.registrationRepository.saveAndFlush(registration);
        if (event.isAttendanceEnabled()) {
            this.recordRegistrationConfirmed(registration, event, payload.paidAt());
        }
    }

    private IntegrationEventEnvelope decodeEnvelope(byte[] body) {
        try {
            IntegrationEventEnvelope envelope = this.objectMapper.readValue(body, IntegrationEventEnvelope.class);
            if (envelope.messageId() == null || envelope.occurredAt() == null || envelope.payloadJson() == null
                    || !PaymentConfirmedPayload.EVENT_TYPE.equals(envelope.eventType())
                    || !"Charge".equals(envelope.aggregateType()) || envelope.aggregateId() == null
                    || envelope.schemaVersion() != 1) {
                throw new InvalidPaymentConfirmedMessageException("Invalid PaymentConfirmed v1 envelope");
            }
            return envelope;
        } catch (IOException exception) {
            throw new InvalidPaymentConfirmedMessageException("Invalid PaymentConfirmed envelope JSON", exception);
        }
    }

    private PaymentConfirmedPayload decodePayload(IntegrationEventEnvelope envelope) {
        try {
            PaymentConfirmedPayload payload = this.objectMapper.treeToValue(envelope.payloadJson(),
                    PaymentConfirmedPayload.class);
            if (payload.chargeId() == null || !payload.chargeId().equals(envelope.aggregateId())
                    || payload.registrationId() == null || payload.eventId() == null || payload.paidAt() == null
                    || payload.userId() == null || payload.userId().isBlank() || payload.amountMinor() <= 0
                    || !PaymentConfirmedPayload.CURRENCY.equals(payload.currency())
                    || payload.paidAt().isAfter(envelope.occurredAt())) {
                throw new InvalidPaymentConfirmedMessageException("Invalid PaymentConfirmed v1 payload");
            }
            return payload;
        } catch (IOException exception) {
            throw new InvalidPaymentConfirmedMessageException("Invalid PaymentConfirmed payload JSON", exception);
        }
    }

    private boolean markProcessed(UUID messageId, UUID registrationId, UUID chargeId, String hash) {
        List<InboxRecord> existing = this.jdbcTemplate.query("""
                SELECT registration_id, message_hash FROM processed_payment_confirmations WHERE message_id = ?
                """, (resultSet, rowNumber) -> new InboxRecord(resultSet.getObject("registration_id", UUID.class),
                resultSet.getString("message_hash")), messageId);
        if (!existing.isEmpty()) {
            if (existing.size() != 1 || !existing.getFirst().registrationId().equals(registrationId)
                    || !existing.getFirst().hash().equals(hash)) {
                throw new InvalidPaymentConfirmedMessageException("messageId was reused with different content");
            }
            return false;
        }

        int inserted = this.jdbcTemplate.update(
                """
                        INSERT INTO processed_payment_confirmations (message_id, registration_id, message_hash, processed_at, charge_id)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                messageId, registrationId, hash, asUtcOffsetDateTime(Instant.now(this.clock)), chargeId);
        if (inserted != 1) {
            throw new InvalidPaymentConfirmedMessageException("messageId was reused with different content");
        }
        return true;
    }

    private String compensationReason(Event event, Registration registration, PaymentConfirmedPayload payload) {
        if (!registration.getEventId().equals(payload.eventId())) {
            return "EVENT_ID_MISMATCH";
        }
        if (!registration.getUserId().equals(payload.userId())) {
            return "USER_ID_MISMATCH";
        }
        if (event.getStatus() == EventStatus.CANCELLED) {
            return "EVENT_CANCELLED";
        }
        if (event.getRegistrationMode() != RegistrationMode.INTERNAL_PAID) {
            return "NOT_INTERNAL_PAID";
        }
        if (registration.getStatus() == RegistrationStatus.CONFIRMED) {
            return null;
        }
        if (registration.getStatus() != RegistrationStatus.PENDING_PAYMENT) {
            return "REGISTRATION_" + registration.getStatus().name();
        }
        if (registration.getPaymentDeadlineAt() == null || registration.getReservationExpiresAt() == null) {
            return "INVALID_PAYMENT_DEADLINES";
        }
        if (payload.paidAt().isBefore(registration.getRegisteredAt())) {
            return "PAYMENT_BEFORE_REGISTRATION";
        }
        if (payload.paidAt().isAfter(registration.getPaymentDeadlineAt())) {
            return "PAYMENT_AFTER_DEADLINE";
        }
        if (!Instant.now(this.clock).isBefore(registration.getReservationExpiresAt())) {
            return "RESERVATION_EXPIRED";
        }
        return null;
    }

    private void recordRegistrationConfirmed(Registration registration, Event event, Instant occurredAt) {
        if (event.getAttendanceMode() == null) {
            throw new IllegalStateException("attendanceEnabled event must define attendanceMode");
        }
        RegistrationConfirmedPayload payload = new RegistrationConfirmedPayload(registration.getId(), event.getId(),
                registration.getUserId(), true, event.getAttendanceMode(), event.getTitle(), event.getStartsAt(),
                event.getEndsAt(), event.getCreatedByUserId());
        try {
            this.jdbcTemplate.update("""
                    INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, UUID.randomUUID(), "Registration", registration.getId(),
                    RegistrationConfirmedPayload.EVENT_TYPE, this.objectMapper.writeValueAsString(payload),
                    asUtcOffsetDateTime(occurredAt));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize RegistrationConfirmed v1", exception);
        }
    }

    private void recordCompensation(PaymentConfirmedPayload payload, UUID messageId, String reason) {
        List<CompensationCase> existing = this.jdbcTemplate.query("""
                SELECT registration_id, payment_message_id, refund_status, refund_request_message_id
                FROM payment_compensation_cases WHERE charge_id = ? FOR UPDATE
                """,
                (resultSet, rowNumber) -> new CompensationCase(resultSet.getObject("registration_id", UUID.class),
                        resultSet.getObject("payment_message_id", UUID.class), resultSet.getString("refund_status"),
                        resultSet.getObject("refund_request_message_id", UUID.class)),
                payload.chargeId());
        if (existing.size() > 1) {
            throw new IllegalStateException("charge has multiple compensation cases");
        }
        Instant now = Instant.now(this.clock);
        UUID refundRequestMessageId;
        if (existing.isEmpty()) {
            refundRequestMessageId = UUID.randomUUID();
            int inserted = this.jdbcTemplate.update("""
                    INSERT INTO payment_compensation_cases (
                        charge_id, registration_id, payment_message_id, reason, recorded_at,
                        refund_status, refund_request_message_id, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
                    """, payload.chargeId(), payload.registrationId(), messageId, reason, asUtcOffsetDateTime(now),
                    refundRequestMessageId, asUtcOffsetDateTime(now));
            if (inserted != 1) {
                throw new IllegalStateException("could not persist payment compensation case");
            }
        } else {
            CompensationCase compensationCase = existing.getFirst();
            if (!compensationCase.registrationId().equals(payload.registrationId())
                    || !compensationCase.paymentMessageId().equals(messageId)) {
                throw new InvalidPaymentConfirmedMessageException(
                        "charge already has a compensation case for different payment data");
            }
            if (compensationCase.refundRequestMessageId() != null) {
                return;
            }
            if (!"PENDING".equals(compensationCase.refundStatus())) {
                return;
            }
            refundRequestMessageId = UUID.randomUUID();
            int updated = this.jdbcTemplate.update("""
                    UPDATE payment_compensation_cases
                    SET refund_request_message_id = ?, updated_at = ?
                    WHERE charge_id = ? AND refund_request_message_id IS NULL
                    """, refundRequestMessageId, asUtcOffsetDateTime(now), payload.chargeId());
            if (updated != 1) {
                throw new IllegalStateException("could not attach refund request to compensation case");
            }
        }

        RefundRequestedPayload refundRequest = new RefundRequestedPayload(payload.chargeId(), payload.registrationId(),
                messageId, reason);
        try {
            int inserted = this.jdbcTemplate.update("""
                    INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload_json, created_at)
                    VALUES (?, 'Charge', ?, ?, ?, ?)
                    """, refundRequestMessageId, payload.chargeId(), RefundRequestedPayload.EVENT_TYPE,
                    this.objectMapper.writeValueAsString(refundRequest), asUtcOffsetDateTime(now));
            if (inserted != 1) {
                throw new IllegalStateException("could not enqueue payment refund request");
            }
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize RefundRequested v1", exception);
        }
    }

    private void trackEventCancellationRefund(PaymentConfirmedPayload payload, UUID paymentMessageId) {
        List<UUID> cancellationMessages = this.jdbcTemplate.query("""
                SELECT id FROM outbox_events
                WHERE aggregate_type = 'Registration' AND aggregate_id = ? AND event_type = ?
                ORDER BY created_at DESC
                """, (row, index) -> row.getObject("id", UUID.class), payload.registrationId(),
                RegistrationCancelledByEventPayload.EVENT_TYPE);
        if (cancellationMessages.isEmpty()) {
            this.recordCompensation(payload, paymentMessageId, "EVENT_CANCELLED");
            return;
        }
        UUID cancellationMessageId = cancellationMessages.getFirst();
        Instant now = Instant.now(this.clock);
        this.jdbcTemplate.update("""
                INSERT INTO event_cancellation_refunds (
                    registration_id, event_id, cancellation_message_id, source_payment_message_id,
                    charge_id, refund_status, created_at, updated_at)
                SELECT ?, ?, ?, ?, ?, 'PENDING', ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM event_cancellation_refunds WHERE registration_id = ?)
                """, payload.registrationId(), payload.eventId(), cancellationMessageId, paymentMessageId,
                payload.chargeId(), asUtcOffsetDateTime(now), asUtcOffsetDateTime(now), payload.registrationId());
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

    private record InboxRecord(UUID registrationId, String hash) {
    }

    private record CompensationCase(UUID registrationId, UUID paymentMessageId, String refundStatus,
            UUID refundRequestMessageId) {
    }
}

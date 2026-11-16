package br.unir.engagement.service;

import br.unir.engagement.dto.EventCancelledPayload;
import br.unir.engagement.dto.RegistrationCancelledByEventPayload;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.entity.Registration;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.entity.RegistrationStatus;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.repository.OutboxRepository;
import br.unir.engagement.repository.RegistrationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Internal institutional cancellation operation. No public route is registered
 * until Campus can authorize it.
 */
@Service
public class EventCancellationService {

    private static final List<RegistrationStatus> CANCELLABLE_STATUSES = List.of(RegistrationStatus.CONFIRMED,
            RegistrationStatus.PENDING_PAYMENT, RegistrationStatus.PAYMENT_EXPIRED);

    private final EventRepository eventRepository;
    private final RegistrationRepository registrationRepository;
    private final OutboxRepository outboxRepository;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public EventCancellationService(EventRepository eventRepository, RegistrationRepository registrationRepository,
            OutboxRepository outboxRepository, JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this(eventRepository, registrationRepository, outboxRepository, jdbcTemplate, objectMapper, Clock.systemUTC());
    }

    EventCancellationService(EventRepository eventRepository, RegistrationRepository registrationRepository,
            OutboxRepository outboxRepository, JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, Clock clock) {
        this.eventRepository = eventRepository;
        this.registrationRepository = registrationRepository;
        this.outboxRepository = outboxRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper.copy();
        this.clock = clock;
    }

    @Transactional
    public void cancel(UUID eventId) {
        Event event = this.eventRepository.findByIdForUpdate(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        if (event.getStatus() == EventStatus.CANCELLED) {
            return;
        }

        // PostgreSQL persists TIMESTAMPTZ at microsecond precision. Keep the
        // payload and Outbox envelope timestamp at the same precision so
        // consumers can validate their temporal ordering without rejecting
        // sub-microsecond differences.
        Instant cancelledAt = Instant.now(this.clock).truncatedTo(ChronoUnit.MICROS);
        event.cancel();
        this.eventRepository.saveAndFlush(event);
        this.saveOutbox(event.getId(), EventCancelledPayload.EVENT_TYPE,
                new EventCancelledPayload(event.getId(), cancelledAt), cancelledAt);

        for (Registration registration : this.registrationRepository.findByEventIdForUpdate(eventId)) {
            if (!CANCELLABLE_STATUSES.contains(registration.getStatus())) {
                continue;
            }
            UUID cancellationMessageId = UUID.randomUUID();
            RegistrationStatus previousStatus = registration.getStatus();
            registration.cancelByEvent(cancelledAt);
            this.registrationRepository.saveAndFlush(registration);
            this.saveOutbox(registration.getId(), RegistrationCancelledByEventPayload.EVENT_TYPE,
                    new RegistrationCancelledByEventPayload(registration.getId(), eventId, registration.getUserId(),
                            cancelledAt),
                    cancelledAt, cancellationMessageId);
            if (event.getRegistrationMode() == RegistrationMode.INTERNAL_PAID
                    && previousStatus == RegistrationStatus.CONFIRMED) {
                this.trackCancellationRefund(registration, eventId, cancellationMessageId, cancelledAt);
            }
        }
    }

    private void trackCancellationRefund(Registration registration, UUID eventId, UUID cancellationMessageId,
            Instant cancelledAt) {
        List<PaymentConfirmation> confirmations = this.jdbcTemplate.query("""
                SELECT message_id, charge_id FROM processed_payment_confirmations
                WHERE registration_id = ? ORDER BY processed_at DESC
                """, (row, index) -> new PaymentConfirmation(row.getObject("message_id", UUID.class),
                row.getObject("charge_id", UUID.class)), registration.getId());
        UUID paymentMessageId = null;
        UUID chargeId = null;
        if (!confirmations.isEmpty()) {
            PaymentConfirmation confirmation = confirmations.getFirst();
            paymentMessageId = confirmation.messageId();
            chargeId = confirmation.chargeId();
        }
        this.jdbcTemplate.update("""
                INSERT INTO event_cancellation_refunds (
                    registration_id, event_id, cancellation_message_id, source_payment_message_id,
                    charge_id, refund_status, created_at, updated_at)
                SELECT ?, ?, ?, ?, ?, 'PENDING', ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM event_cancellation_refunds WHERE registration_id = ?)
                """, registration.getId(), eventId, cancellationMessageId, paymentMessageId, chargeId,
                asUtcOffsetDateTime(cancelledAt), asUtcOffsetDateTime(cancelledAt), registration.getId());
    }

    private void saveOutbox(UUID aggregateId, String eventType, Object payload, Instant occurredAt) {
        this.saveOutbox(aggregateId, eventType, payload, occurredAt, UUID.randomUUID());
    }

    private void saveOutbox(UUID aggregateId, String eventType, Object payload, Instant occurredAt, UUID messageId) {
        try {
            this.outboxRepository.saveAndFlush(new OutboxEvent(messageId,
                    EventCancelledPayload.EVENT_TYPE.equals(eventType) ? "Event" : "Registration", aggregateId,
                    eventType, this.objectMapper.writeValueAsString(payload), occurredAt));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize " + eventType + " v1", exception);
        }
    }

    private static OffsetDateTime asUtcOffsetDateTime(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }

    private record PaymentConfirmation(UUID messageId, UUID chargeId) {
    }
}

package br.unir.engagement.service;

import br.unir.engagement.dto.RegistrationListResponse;
import br.unir.engagement.dto.RegistrationConfirmedPayload;
import br.unir.engagement.dto.RegistrationCancelledPayload;
import br.unir.engagement.dto.RegistrationPaymentRequestedPayload;
import br.unir.engagement.dto.RegistrationResponse;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.entity.Registration;
import br.unir.engagement.entity.RegistrationStatus;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.repository.OutboxRepository;
import br.unir.engagement.repository.RegistrationRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RegistrationService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final List<RegistrationStatus> ACTIVE_STATUSES = List.of(RegistrationStatus.CONFIRMED,
            RegistrationStatus.PENDING_PAYMENT);

    private final EventRepository eventRepository;
    private final RegistrationRepository registrationRepository;
    private final OutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;

    public RegistrationService(EventRepository eventRepository, RegistrationRepository registrationRepository,
            OutboxRepository outboxRepository, ObjectMapper objectMapper) {
        this.eventRepository = eventRepository;
        this.registrationRepository = registrationRepository;
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper.copy();
    }

    @Transactional
    public RegistrationResponse register(UUID eventId, String userId) {
        Event event = this.eventRepository.findByIdForUpdate(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        validateEventForRegistration(event, now);

        var activeRegistration = this.registrationRepository
                .findFirstByEventIdAndUserIdAndStatusInOrderByRegisteredAtDesc(eventId, userId, ACTIVE_STATUSES);
        if (activeRegistration.isPresent()) {
            Registration previous = activeRegistration.get();
            if (previous.getStatus() == RegistrationStatus.PENDING_PAYMENT
                    && (previous.getReservationExpiresAt() == null
                            || !previous.getReservationExpiresAt().isAfter(now))) {
                previous.expirePayment();
                this.registrationRepository.saveAndFlush(previous);
            } else {
                throw conflict("ALREADY_REGISTERED");
            }
        }
        if (event.getCapacity() != null && this.registrationRepository.countCapacityOccupants(eventId,
                RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING_PAYMENT, now) >= event.getCapacity()) {
            throw conflict("EVENT_FULL");
        }

        Registration registration;
        if (event.getRegistrationMode() == RegistrationMode.INTERNAL_FREE) {
            registration = new Registration(UUID.randomUUID(), event.getId(), userId, RegistrationStatus.CONFIRMED, now,
                    now, null, null, null);
        } else {
            if (event.getPrice() == null || event.getPrice() <= 0) {
                throw conflict("EVENT_PRICE_NOT_CONFIGURED");
            }
            Instant paymentDeadlineAt = now.plus(Duration.ofMinutes(10));
            Instant reservationExpiresAt = now.plus(Duration.ofMinutes(15));
            registration = new Registration(UUID.randomUUID(), event.getId(), userId,
                    RegistrationStatus.PENDING_PAYMENT, now, null, null, paymentDeadlineAt, reservationExpiresAt);
        }

        Registration saved = this.registrationRepository.saveAndFlush(registration);
        if (saved.getStatus() == RegistrationStatus.PENDING_PAYMENT) {
            this.createPaymentRequest(saved, event);
        } else if (event.isAttendanceEnabled()) {
            this.createRegistrationConfirmed(saved, event);
        }
        return RegistrationResponse.from(saved, event);
    }

    @Transactional(readOnly = true)
    public RegistrationListResponse listForUser(String userId, int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "page must be non-negative and size must be between 1 and 100");
        }
        Page<Registration> registrations = this.registrationRepository.findByUserIdOrderByRegisteredAtDesc(userId,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "registeredAt")));
        Map<UUID, Event> eventsById = this.eventRepository
                .findAllById(registrations.getContent().stream().map(Registration::getEventId).distinct().toList())
                .stream().collect(Collectors.toMap(Event::getId, Function.identity()));
        Page<RegistrationResponse> responses = registrations.map(
                registration -> RegistrationResponse.from(registration, eventsById.get(registration.getEventId())));
        return RegistrationListResponse.from(responses);
    }

    @Transactional
    public RegistrationResponse cancel(UUID registrationId, String userId) {
        UUID eventId = this.registrationRepository.findEventIdForUser(registrationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Registration not found"));
        Event event = this.eventRepository.findByIdForUpdate(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        Registration registration = this.registrationRepository.findByIdAndUserId(registrationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Registration not found"));

        if (registration.getStatus() != RegistrationStatus.CONFIRMED) {
            throw conflict("REGISTRATION_NOT_ACTIVE");
        }
        if (event.getRegistrationMode() != RegistrationMode.INTERNAL_FREE) {
            throw conflict("ONLY_FREE_REGISTRATIONS_CAN_BE_CANCELLED");
        }

        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Instant cancellationDeadline = event.getStartsAt().minus(Duration.ofHours(24));
        if (now.isAfter(cancellationDeadline)) {
            throw conflict("CANCELLATION_WINDOW_CLOSED");
        }

        registration.cancelByUser(now);
        Registration saved = this.registrationRepository.saveAndFlush(registration);
        this.saveRegistrationCancelled(saved, now);
        return RegistrationResponse.from(saved, event);
    }

    private static void validateEventForRegistration(Event event, Instant now) {
        if (event.getStatus() == EventStatus.CANCELLED) {
            throw conflict("EVENT_CANCELLED");
        }
        if (event.getRegistrationMode() == RegistrationMode.EXTERNAL_PAID) {
            throw conflict("REGISTRATION_MODE_NOT_SUPPORTED");
        }
        if (!now.isBefore(event.getRegistrationDeadline())) {
            throw conflict("REGISTRATION_CLOSED");
        }
    }

    private void createPaymentRequest(Registration registration, Event event) {
        RegistrationPaymentRequestedPayload payload = new RegistrationPaymentRequestedPayload(registration.getId(),
                event.getId(), registration.getUserId(), event.getPrice(), RegistrationPaymentRequestedPayload.CURRENCY,
                registration.getPaymentDeadlineAt(), registration.getReservationExpiresAt());
        try {
            String payloadJson = this.objectMapper.writeValueAsString(payload);
            OutboxEvent outboxEvent = new OutboxEvent(UUID.randomUUID(), "Registration", registration.getId(),
                    RegistrationPaymentRequestedPayload.EVENT_TYPE, payloadJson, registration.getRegisteredAt());
            this.outboxRepository.saveAndFlush(outboxEvent);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize RegistrationPaymentRequested v1", exception);
        }
    }

    private void createRegistrationConfirmed(Registration registration, Event event) {
        if (event.getAttendanceMode() == null) {
            throw new IllegalStateException("attendanceEnabled event must define attendanceMode");
        }
        RegistrationConfirmedPayload payload = new RegistrationConfirmedPayload(registration.getId(), event.getId(),
                registration.getUserId(), true, event.getAttendanceMode(), event.getTitle(), event.getStartsAt(),
                event.getEndsAt(), event.getCreatedByUserId());
        try {
            String payloadJson = this.objectMapper.writeValueAsString(payload);
            OutboxEvent outboxEvent = new OutboxEvent(UUID.randomUUID(), "Registration", registration.getId(),
                    RegistrationConfirmedPayload.EVENT_TYPE, payloadJson, registration.getConfirmedAt());
            this.outboxRepository.saveAndFlush(outboxEvent);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize RegistrationConfirmed v1", exception);
        }
    }

    private void saveRegistrationCancelled(Registration registration, Instant cancelledAt) {
        RegistrationCancelledPayload payload = new RegistrationCancelledPayload(registration.getId(),
                registration.getEventId(), registration.getUserId(), cancelledAt);
        try {
            String payloadJson = this.objectMapper.writeValueAsString(payload);
            this.outboxRepository.saveAndFlush(new OutboxEvent(UUID.randomUUID(), "Registration", registration.getId(),
                    RegistrationCancelledPayload.EVENT_TYPE, payloadJson, cancelledAt));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize RegistrationCancelled v1", exception);
        }
    }

    private static ResponseStatusException conflict(String detail) {
        return new ResponseStatusException(HttpStatus.CONFLICT, detail);
    }
}

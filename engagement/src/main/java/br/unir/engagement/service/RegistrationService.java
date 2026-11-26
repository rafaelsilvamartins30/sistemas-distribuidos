package br.unir.engagement.service;

import br.unir.engagement.dto.PaymentReferenceResponse;
import br.unir.engagement.dto.RegistrationListResponse;
import br.unir.engagement.dto.RegistrationConfirmedPayload;
import br.unir.engagement.dto.RegistrationCancelledPayload;
import br.unir.engagement.dto.RegistrationPaymentRequestedPayload;
import br.unir.engagement.dto.RegistrationResponse;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventRegistrationPolicy;
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
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Page;
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

    @Transactional(readOnly = true)
    public List<UUID> getMyPaymentReferences(String userId) {
        return this.registrationRepository.findPaymentReferences(userId);
    }

    @Transactional(readOnly = true)
    public Map<UUID, PaymentReferenceResponse> getMyPaymentReferenceDetails(String userId) {
        Map<UUID, PaymentReferenceResponse> details = new HashMap<>();
        for (Object[] row : this.registrationRepository.findPaymentReferenceDetails(userId)) {
            UUID registrationId = (UUID) row[0];
            UUID eventId = (UUID) row[1];
            String eventTitle = (String) row[2];
            details.put(registrationId,
                    new PaymentReferenceResponse("EVENT", eventTitle, "Inscrição em evento", "/eventos/" + eventId));
        }
        return details;
    }

    @Transactional
    public RegistrationResponse register(UUID eventId, String userId) {
        Event event = this.eventRepository.findByIdForUpdate(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        String blockedReason = EventRegistrationPolicy.blockedReason(event.getStatus(), event.getRegistrationMode(),
                event.getRegistrationDeadline(), event.getPrice(), now);
        if (blockedReason != null) {
            throw conflict(blockedReason);
        }

        var activeRegistration = this.registrationRepository
                .findFirstByEventIdAndUserIdAndStatusInOrderByRegisteredAtDesc(eventId, userId, ACTIVE_STATUSES);
        if (activeRegistration.isPresent()) {
            Registration previous = activeRegistration.get();
            if (reservationExpired(previous, now)) {
                previous.expirePayment();
                this.registrationRepository.saveAndFlush(previous);
            } else {
                throw conflict("ALREADY_REGISTERED");
            }
        }
        if (eventFull(event, now)) {
            throw conflict("EVENT_FULL");
        }

        Registration registration;
        if (event.getRegistrationMode() == RegistrationMode.INTERNAL_FREE) {
            registration = new Registration(UUID.randomUUID(), event.getId(), userId, RegistrationStatus.CONFIRMED, now,
                    now, null, null, null);
        } else {
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
        return RegistrationResponse.from(saved, event, now);
    }

    @Transactional(readOnly = true)
    public RegistrationListResponse listForUser(String userId, int page, int size, UUID eventId, LocalDate startOn,
            LocalDate endOn, String agenda) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "page must be non-negative and size must be between 1 and 100");
        }
        if (agenda != null && !agenda.equals("upcoming") && !agenda.equals("past") && !agenda.equals("cancelled")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid agenda");
        }
        if (startOn != null && endOn != null && endOn.isBefore(startOn)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date range");
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Instant startsFrom = startOn == null ? null : startOn.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant startsBefore = endOn == null ? null : endOn.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Page<Registration> registrations = this.registrationRepository.findAgenda(userId, eventId, startsFrom,
                startsBefore, agenda, now, PageRequest.of(page, size));
        Map<UUID, Event> eventsById = this.eventRepository
                .findAllById(registrations.getContent().stream().map(Registration::getEventId).distinct().toList())
                .stream().collect(Collectors.toMap(Event::getId, Function.identity()));
        Page<RegistrationResponse> responses = registrations.map(registration -> RegistrationResponse.from(registration,
                eventsById.get(registration.getEventId()), now));
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

        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        String blockedReason = registration.cancellationBlockedReason(event, now);
        if (blockedReason != null) {
            throw conflict(blockedReason);
        }

        registration.cancelByUser(now);
        Registration saved = this.registrationRepository.saveAndFlush(registration);
        this.saveRegistrationCancelled(saved, now);
        return RegistrationResponse.from(saved, event, now);
    }

    @Transactional(readOnly = true)
    public String registrationBlockedReason(UUID eventId, String userId) {
        Event event = this.eventRepository.findById(eventId).orElse(null);
        if (event == null) {
            return "EVENT_UNAVAILABLE";
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        String reason = EventRegistrationPolicy.blockedReason(event.getStatus(), event.getRegistrationMode(),
                event.getRegistrationDeadline(), event.getPrice(), now);
        if (reason != null) {
            return reason;
        }
        var active = this.registrationRepository.findFirstByEventIdAndUserIdAndStatusInOrderByRegisteredAtDesc(eventId,
                userId, ACTIVE_STATUSES);
        if (active.isPresent() && !reservationExpired(active.get(), now)) {
            return "ALREADY_REGISTERED";
        }
        return eventFull(event, now) ? "EVENT_FULL" : null;
    }

    private boolean eventFull(Event event, Instant now) {
        return event.getCapacity() != null && this.registrationRepository.countCapacityOccupants(event.getId(),
                RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING_PAYMENT, now) >= event.getCapacity();
    }

    private static boolean reservationExpired(Registration registration, Instant now) {
        return registration.getStatus() == RegistrationStatus.PENDING_PAYMENT
                && (registration.getReservationExpiresAt() == null
                        || !registration.getReservationExpiresAt().isAfter(now));
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

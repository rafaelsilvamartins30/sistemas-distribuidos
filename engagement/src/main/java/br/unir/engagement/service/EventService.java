package br.unir.engagement.service;

import br.unir.engagement.client.CampusEventOrganizerClient;
import br.unir.engagement.dto.CreateEventRequest;
import br.unir.engagement.dto.EventListResponse;
import br.unir.engagement.dto.EventProjectionEvents;
import br.unir.engagement.dto.EventOrganizerContext;
import br.unir.engagement.dto.EventPublicationContextsResponse;
import br.unir.engagement.dto.EventPublicationContextsResponse.Context;
import br.unir.engagement.dto.EventResponse;
import br.unir.engagement.dto.UpdateEventRequest;
import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.repository.EventRepository;
import jakarta.persistence.criteria.Predicate;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EventService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<String> EXTERNAL_PAID_ORGANIZERS = Set.of("COMMUNITY", "ACADEMIC_ENTITY");
    private static final Set<String> ALLOWED_ORGANIZERS = Set.of("PROFESSOR", "DEPARTMENT", "ACADEMIC_UNIT",
            "UNIVERSITY", "ACADEMIC_ENTITY", "COMMUNITY");

    private final EventRepository eventRepository;
    private final RegistrationService registrationService;
    private final CampusEventOrganizerClient campusOrganizerClient;
    private final EventCancellationService eventCancellationService;
    private final EventProjectionStore eventProjectionStore;
    private final EventProjectionOutboxWriter projectionOutboxWriter;

    @Autowired
    @SuppressFBWarnings(value = "EI_EXPOSE_REP2", justification = "Spring injects the container-managed service dependencies")
    public EventService(EventRepository eventRepository, RegistrationService registrationService,
            CampusEventOrganizerClient campusOrganizerClient, EventCancellationService eventCancellationService,
            EventProjectionStore eventProjectionStore, EventProjectionOutboxWriter projectionOutboxWriter) {
        this.eventRepository = eventRepository;
        this.registrationService = registrationService;
        this.campusOrganizerClient = campusOrganizerClient;
        this.eventCancellationService = eventCancellationService;
        this.eventProjectionStore = eventProjectionStore;
        this.projectionOutboxWriter = projectionOutboxWriter;
    }

    public EventListResponse listEvents(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "page must be non-negative and size must be between 1 and 100");
        }
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "startsAt"));
        var result = this.readModel(() -> this.eventProjectionStore.findDiscoverable(Instant.now(), pageable))
                .map(EventResponse::from);
        return EventListResponse.from(result);
    }

    public EventResponse getEvent(UUID id, String bearerToken, String userId) {
        var view = this.readModel(() -> this.eventProjectionStore.findById(id.toString()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        boolean viewerCanManage = view.status() == EventStatus.ACTIVE && this.canOfferManagementActions(id,
                view.organizerType(), UUID.fromString(view.organizerId()), bearerToken);
        String registrationBlockedReason;
        try {
            registrationBlockedReason = this.registrationService.registrationBlockedReason(id, userId);
        } catch (DataAccessException exception) {
            registrationBlockedReason = "EVENT_UNAVAILABLE";
        }
        return EventResponse.from(view, viewerCanManage, registrationBlockedReason);
    }

    private boolean canOfferManagementActions(UUID id, String organizerType, UUID organizerId, String bearerToken) {
        try {
            return this.isAuthorizedOrganizer(organizerType, organizerId, bearerToken)
                    && this.eventRepository.existsByIdAndStatus(id, EventStatus.ACTIVE);
        } catch (ResponseStatusException | DataAccessException exception) {
            // The public read model remains available while authorization or the write
            // store is unavailable.
            return false;
        }
    }

    public EventPublicationContextsResponse getOrganizerContexts(String bearerToken) {
        return new EventPublicationContextsResponse(this.campusOrganizerClient.getContexts(bearerToken).items().stream()
                .filter(context -> ALLOWED_ORGANIZERS.contains(context.organizerType()))
                .map(context -> new Context(context.organizerType(), context.organizerId(), context.name(),
                        paidRegistrationMode(context.organizerType())))
                .toList());
    }

    public EventListResponse listManagedEvents(int page, int size, String bearerToken) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "page must be non-negative and size must be between 1 and 100");
        }
        var organizersByType = this.campusOrganizerClient.getContexts(bearerToken).items().stream()
                .collect(Collectors.groupingBy(EventOrganizerContext::organizerType,
                        Collectors.mapping(EventOrganizerContext::organizerId, Collectors.toSet())));
        if (organizersByType.isEmpty()) {
            return new EventListResponse(List.of(), page, size, 0, 0);
        }
        var pageable = PageRequest.of(page, size,
                Sort.by(Sort.Direction.DESC, "startsAt").and(Sort.by(Sort.Direction.ASC, "id")));
        var result = this.eventRepository.findAll(
                (event, query,
                        builder) -> builder.or(organizersByType.entrySet().stream()
                                .map(entry -> builder.and(builder.equal(event.get("organizerType"), entry.getKey()),
                                        event.get("organizerId").in(entry.getValue())))
                                .toArray(Predicate[]::new)),
                pageable).map(event -> EventResponse.from(event, true));
        return EventListResponse.from(result);
    }

    @Transactional
    public EventResponse createEvent(CreateEventRequest request, String bearerToken, String createdByUserId) {
        String organizerType = normalize(request.organizerType()).toUpperCase(Locale.ROOT);
        if (!ALLOWED_ORGANIZERS.contains(organizerType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported organizerType");
        }

        List<EventOrganizerContext> contexts = this.campusOrganizerClient.getContexts(bearerToken).items();
        EventOrganizerContext verifiedOrganizer = contexts.stream()
                .filter(context -> organizerType.equals(context.organizerType()))
                .filter(context -> request.organizerId().equals(context.organizerId())).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "The authenticated user is not authorized for this organizer"));

        Instant now = Instant.now();
        String title = requireNonBlank(request.title(), "title must not be blank");
        String description = requireNonBlank(request.description(), "description must not be blank");
        String location = requireNonBlank(request.location(), "location must not be blank");
        String category = requireNonBlank(request.category(), "category must not be blank");
        String imageUrl = validateOptionalUrl(request.imageUrl());
        validateScheduleAndCapacity(request.startsAt(), request.endsAt(), request.registrationDeadline(),
                request.capacity(), now, true);

        RegistrationConfig registrationConfig = validateRegistrationMode(organizerType, request.registrationMode(),
                request.price(), request.externalUrl(), request.attendanceEnabled(), request.attendanceMode());

        Event event = new Event(UUID.randomUUID(), title, description, verifiedOrganizer.organizerType(),
                verifiedOrganizer.organizerId(), imageUrl, location, request.startsAt(), request.endsAt(), category,
                request.capacity(), request.registrationDeadline(), registrationConfig.mode(),
                registrationConfig.price(), registrationConfig.externalUrl(), registrationConfig.attendanceEnabled(),
                registrationConfig.attendanceMode(), EventStatus.ACTIVE, now, createdByUserId);
        Event savedEvent = this.eventRepository.saveAndFlush(event);
        this.projectionOutboxWriter.append(savedEvent, EventProjectionEvents.CREATED, savedEvent.getCreatedAt());
        return EventResponse.from(savedEvent, true);
    }

    @Transactional
    public EventResponse updateEvent(UUID eventId, UpdateEventRequest request, String bearerToken) {
        Event event = this.eventRepository.findByIdForUpdate(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        this.verifyOrganizerAuthorization(event, bearerToken);
        if (event.getStatus() == EventStatus.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cancelled event cannot be modified");
        }

        String title = request.title() == null
                ? event.getTitle()
                : requireNonBlank(request.title(), "title must not be blank");
        String description = request.description() == null
                ? event.getDescription()
                : requireNonBlank(request.description(), "description must not be blank");
        String location = request.location() == null
                ? event.getLocation()
                : requireNonBlank(request.location(), "location must not be blank");
        String category = request.category() == null
                ? event.getCategory()
                : requireNonBlank(request.category(), "category must not be blank");

        String imageUrl = event.getImageUrl();
        if (Boolean.TRUE.equals(request.clearImageUrl())) {
            imageUrl = null;
        } else if (request.imageUrl() != null) {
            imageUrl = validateOptionalUrl(request.imageUrl());
        }

        Instant startsAt = request.startsAt() == null ? event.getStartsAt() : request.startsAt();
        Instant endsAt = request.endsAt() == null ? event.getEndsAt() : request.endsAt();
        Instant registrationDeadline = request.registrationDeadline() == null
                ? event.getRegistrationDeadline()
                : request.registrationDeadline();
        Integer capacity = Boolean.TRUE.equals(request.clearCapacity())
                ? null
                : request.capacity() == null ? event.getCapacity() : request.capacity();

        validateScheduleAndCapacity(startsAt, endsAt, registrationDeadline, capacity, Instant.now(), false);

        RegistrationMode mode = request.registrationMode() == null
                ? event.getRegistrationMode()
                : request.registrationMode();
        Long price = Boolean.TRUE.equals(request.clearPrice())
                ? null
                : request.price() == null ? event.getPrice() : request.price();
        String externalUrl = Boolean.TRUE.equals(request.clearExternalUrl())
                ? null
                : request.externalUrl() == null ? event.getExternalUrl() : request.externalUrl();
        boolean attendanceEnabled = request.attendanceEnabled() == null
                ? event.isAttendanceEnabled()
                : request.attendanceEnabled();
        AttendanceMode attendanceMode = request.attendanceMode() == null
                ? event.getAttendanceMode()
                : request.attendanceMode();

        RegistrationConfig registrationConfig = validateRegistrationMode(event.getOrganizerType(), mode, price,
                externalUrl, attendanceEnabled, attendanceMode);

        event.updateDetails(title, description, imageUrl, location, startsAt, endsAt, category, capacity,
                registrationDeadline, registrationConfig.mode(), registrationConfig.price(),
                registrationConfig.externalUrl(), registrationConfig.attendanceEnabled(),
                registrationConfig.attendanceMode());
        Event savedEvent = this.eventRepository.saveAndFlush(event);
        this.projectionOutboxWriter.append(savedEvent, EventProjectionEvents.UPDATED, Instant.now());
        return EventResponse.from(savedEvent, true);
    }

    @Transactional
    public EventResponse cancelEvent(UUID eventId, String bearerToken) {
        Event event = this.eventRepository.findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        this.verifyOrganizerAuthorization(event, bearerToken);
        this.eventCancellationService.cancel(eventId);
        return EventResponse.from(this.eventRepository.findById(eventId).orElse(event));
    }

    private void verifyOrganizerAuthorization(Event event, String bearerToken) {
        if (!this.isAuthorizedOrganizer(event.getOrganizerType(), event.getOrganizerId(), bearerToken)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "The authenticated user is not authorized for this organizer");
        }
    }

    private boolean isAuthorizedOrganizer(String organizerType, UUID organizerId, String bearerToken) {
        return this.campusOrganizerClient.getContexts(bearerToken).items().stream().anyMatch(
                context -> organizerType.equals(context.organizerType()) && organizerId.equals(context.organizerId()));
    }

    private <T> T readModel(java.util.function.Supplier<T> query) {
        try {
            return query.get();
        } catch (DataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Event read model is unavailable",
                    exception);
        }
    }

    private static void validateScheduleAndCapacity(Instant startsAt, Instant endsAt, Instant registrationDeadline,
            Integer capacity, Instant now, boolean requireFutureDeadline) {
        if (!endsAt.isAfter(startsAt)) {
            throw invalidEvent("EVENT_END_NOT_AFTER_START", "endsAt must be after startsAt");
        }
        if (registrationDeadline.isAfter(endsAt)) {
            throw invalidEvent("EVENT_DEADLINE_AFTER_END", "registrationDeadline must not be after endsAt");
        }
        if (requireFutureDeadline && !registrationDeadline.isAfter(now)) {
            throw invalidEvent("EVENT_DEADLINE_NOT_FUTURE", "registrationDeadline must be in the future");
        }
        if (capacity != null && capacity <= 0) {
            throw invalidEvent("EVENT_INVALID_CAPACITY", "capacity must be greater than zero");
        }
    }

    private static ResponseStatusException invalidEvent(String code, String detail) {
        var error = new ResponseStatusException(HttpStatus.BAD_REQUEST, detail);
        error.getBody().setProperty("code", code);
        return error;
    }

    private static RegistrationMode paidRegistrationMode(String organizerType) {
        return EXTERNAL_PAID_ORGANIZERS.contains(organizerType)
                ? RegistrationMode.EXTERNAL_PAID
                : RegistrationMode.INTERNAL_PAID;
    }

    private static RegistrationConfig validateRegistrationMode(String organizerType, RegistrationMode mode, Long price,
            String externalUrl, Boolean attendanceEnabledInput, AttendanceMode attendanceModeInput) {
        if (mode == RegistrationMode.INTERNAL_FREE) {
            boolean attendanceEnabled = Boolean.TRUE.equals(attendanceEnabledInput);
            AttendanceMode attendanceMode = attendanceEnabled
                    ? (attendanceModeInput == null ? AttendanceMode.PARTICIPANT_SCANS_EVENT : attendanceModeInput)
                    : null;
            return new RegistrationConfig(mode, null, null, attendanceEnabled, attendanceMode);
        }

        RegistrationMode allowedPaidMode = paidRegistrationMode(organizerType);
        if (mode != allowedPaidMode) {
            throw invalidEvent("EVENT_UNSUPPORTED_PAID_MODE",
                    "Paid events for this organizer must use " + allowedPaidMode);
        }
        if (mode == RegistrationMode.INTERNAL_PAID) {
            if (price == null || price <= 0) {
                throw invalidEvent("EVENT_PAID_PRICE_REQUIRED",
                        "INTERNAL_PAID events require a positive price in minor units");
            }
            boolean attendanceEnabled = Boolean.TRUE.equals(attendanceEnabledInput);
            AttendanceMode attendanceMode = attendanceEnabled
                    ? (attendanceModeInput == null ? AttendanceMode.PARTICIPANT_SCANS_EVENT : attendanceModeInput)
                    : null;
            return new RegistrationConfig(mode, price, null, attendanceEnabled, attendanceMode);
        }

        String validatedExternalUrl = trimToNull(externalUrl);
        if (validatedExternalUrl == null || !isWebUrl(validatedExternalUrl)) {
            throw invalidEvent("EVENT_EXTERNAL_URL_REQUIRED",
                    "EXTERNAL_PAID events require a valid HTTP or HTTPS externalUrl");
        }
        if (price != null && price < 0) {
            throw invalidEvent("EVENT_NEGATIVE_PRICE", "price must be non-negative");
        }
        return new RegistrationConfig(mode, price, validatedExternalUrl, false, null);
    }

    private static String validateOptionalUrl(String value) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            return null;
        }
        if (!isWebUrl(trimmed)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URLs must use HTTP or HTTPS");
        }
        return trimmed;
    }

    private static boolean isWebUrl(String value) {
        try {
            URI uri = new URI(value.trim());
            return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                    && uri.getHost() != null;
        } catch (URISyntaxException exception) {
            return false;
        }
    }

    private static String requireNonBlank(String value, String message) {
        String trimmed = normalize(value);
        if (trimmed.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return trimmed;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record RegistrationConfig(RegistrationMode mode, Long price, String externalUrl, boolean attendanceEnabled,
            AttendanceMode attendanceMode) {
    }
}

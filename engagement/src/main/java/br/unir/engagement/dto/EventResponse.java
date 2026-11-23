package br.unir.engagement.dto;

import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.EventView;
import br.unir.engagement.entity.RegistrationMode;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public record EventResponse(UUID id, String title, String description, String organizerType, UUID organizerId,
        String createdByUserId, String imageUrl, String location, Instant startsAt, Instant endsAt, String category,
        Integer capacity, Instant registrationDeadline, RegistrationMode registrationMode, Long price,
        String externalUrl, boolean attendanceEnabled, AttendanceMode attendanceMode, EventStatus status,
        Instant createdAt, @JsonProperty("_links") Map<String, HateoasLink> links) {

    public EventResponse {
        links = links == null ? Map.of() : Map.copyOf(links);
    }

    public static EventResponse from(Event event) {
        return new EventResponse(event.getId(), event.getTitle(), event.getDescription(), event.getOrganizerType(),
                event.getOrganizerId(), event.getCreatedByUserId(), event.getImageUrl(), event.getLocation(),
                event.getStartsAt(), event.getEndsAt(), event.getCategory(), event.getCapacity(),
                event.getRegistrationDeadline(), event.getRegistrationMode(), event.getPrice(), event.getExternalUrl(),
                event.isAttendanceEnabled(), event.getAttendanceMode(), event.getStatus(), event.getCreatedAt(),
                buildLinks(event.getId(), event.getRegistrationMode(), event.isAttendanceEnabled(), event.getStatus()));
    }

    public static EventResponse from(EventView event) {
        UUID eventId = UUID.fromString(event.id());
        return new EventResponse(eventId, event.title(), event.description(), event.organizerType(),
                UUID.fromString(event.organizerId()), event.createdByUserId(), event.imageUrl(), event.location(),
                event.startsAt(), event.endsAt(), event.category(), event.capacity(), event.registrationDeadline(),
                event.registrationMode(), event.price(), event.externalUrl(), event.attendanceEnabled(),
                event.attendanceMode(), event.status(), event.createdAt(),
                buildLinks(eventId, event.registrationMode(), event.attendanceEnabled(), event.status()));
    }

    private static Map<String, HateoasLink> buildLinks(UUID id, RegistrationMode registrationMode,
            boolean attendanceEnabled, EventStatus status) {
        Map<String, HateoasLink> links = new LinkedHashMap<>();
        String selfHref = "/api/v1/events/" + id;
        links.put("self", new HateoasLink(selfHref, "GET"));
        links.put("collection", new HateoasLink("/api/v1/events", "GET"));
        if (status == EventStatus.ACTIVE) {
            links.put("update", new HateoasLink(selfHref, "PATCH"));
            links.put("cancel", new HateoasLink(selfHref, "DELETE"));
            if (registrationMode != RegistrationMode.EXTERNAL_PAID) {
                links.put("register", new HateoasLink(selfHref + "/registrations", "POST"));
            }
            if (attendanceEnabled) {
                links.put("attendanceQr", new HateoasLink("/api/v1/web/attendance/events/" + id + "/qr", "POST"));
            }
        }
        return links;
    }
}

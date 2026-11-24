package br.unir.engagement.dto;

import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.EventRegistrationPolicy;
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
        Instant createdAt, String registrationBlockedReason, boolean viewerCanManage,
        @JsonProperty("_links") Map<String, HateoasLink> links) {

    public EventResponse {
        links = links == null ? Map.of() : Map.copyOf(links);
    }

    public static EventResponse from(Event event) {
        return from(event, false);
    }

    public static EventResponse from(Event event, boolean viewerCanManage) {
        return new EventResponse(event.getId(), event.getTitle(), event.getDescription(), event.getOrganizerType(),
                event.getOrganizerId(), event.getCreatedByUserId(), event.getImageUrl(), event.getLocation(),
                event.getStartsAt(), event.getEndsAt(), event.getCategory(), event.getCapacity(),
                event.getRegistrationDeadline(), event.getRegistrationMode(), event.getPrice(), event.getExternalUrl(),
                event.isAttendanceEnabled(), event.getAttendanceMode(), event.getStatus(), event.getCreatedAt(),
                EventRegistrationPolicy.blockedReason(event.getStatus(), event.getRegistrationMode(),
                        event.getRegistrationDeadline(), event.getPrice(), Instant.now()),
                viewerCanManage,
                buildLinks(event.getId(), event.getRegistrationMode(), event.getStatus(), viewerCanManage));
    }

    public static EventResponse from(EventView event) {
        return from(event, false);
    }

    public static EventResponse from(EventView event, boolean viewerCanManage) {
        return from(event, viewerCanManage, EventRegistrationPolicy.blockedReason(event.status(),
                event.registrationMode(), event.registrationDeadline(), event.price(), Instant.now()));
    }

    public static EventResponse from(EventView event, boolean viewerCanManage, String registrationBlockedReason) {
        UUID eventId = UUID.fromString(event.id());
        return new EventResponse(eventId, event.title(), event.description(), event.organizerType(),
                UUID.fromString(event.organizerId()), event.createdByUserId(), event.imageUrl(), event.location(),
                event.startsAt(), event.endsAt(), event.category(), event.capacity(), event.registrationDeadline(),
                event.registrationMode(), event.price(), event.externalUrl(), event.attendanceEnabled(),
                event.attendanceMode(), event.status(), event.createdAt(), registrationBlockedReason, viewerCanManage,
                buildLinks(eventId, event.registrationMode(), event.status(), viewerCanManage));
    }

    private static Map<String, HateoasLink> buildLinks(UUID id, RegistrationMode registrationMode, EventStatus status,
            boolean viewerCanManage) {
        Map<String, HateoasLink> links = new LinkedHashMap<>();
        String selfHref = "/api/v1/events/" + id;
        links.put("self", new HateoasLink(selfHref, "GET"));
        links.put("collection", new HateoasLink("/api/v1/events", "GET"));
        if (status == EventStatus.ACTIVE) {
            if (viewerCanManage) {
                links.put("update", new HateoasLink(selfHref, "PATCH"));
                links.put("cancel", new HateoasLink(selfHref, "DELETE"));
            }
            if (registrationMode != RegistrationMode.EXTERNAL_PAID) {
                links.put("register", new HateoasLink(selfHref + "/registrations", "POST"));
            }
        }
        return links;
    }
}

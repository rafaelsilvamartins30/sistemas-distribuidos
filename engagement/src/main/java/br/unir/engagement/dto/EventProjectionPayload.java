package br.unir.engagement.dto;

import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.RegistrationMode;
import java.time.Instant;
import java.util.UUID;

/**
 * Complete snapshot written to the Event read model by each versioned v1 event.
 */
public record EventProjectionPayload(UUID eventId, long aggregateVersion, String title, String description,
        String organizerType, UUID organizerId, String createdByUserId, String imageUrl, String location,
        Instant startsAt, Instant endsAt, String category, Integer capacity, Instant registrationDeadline,
        RegistrationMode registrationMode, Long price, String externalUrl, boolean attendanceEnabled,
        AttendanceMode attendanceMode, EventStatus status, Instant createdAt) {

    public static EventProjectionPayload from(Event event) {
        return new EventProjectionPayload(event.getId(), event.getAggregateVersion(), event.getTitle(),
                event.getDescription(), event.getOrganizerType(), event.getOrganizerId(), event.getCreatedByUserId(),
                event.getImageUrl(), event.getLocation(), event.getStartsAt(), event.getEndsAt(), event.getCategory(),
                event.getCapacity(), event.getRegistrationDeadline(), event.getRegistrationMode(), event.getPrice(),
                event.getExternalUrl(), event.isAttendanceEnabled(), event.getAttendanceMode(), event.getStatus(),
                event.getCreatedAt());
    }
}

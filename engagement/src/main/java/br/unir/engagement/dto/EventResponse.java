package br.unir.engagement.dto;

import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventView;
import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.RegistrationMode;
import java.time.Instant;
import java.util.UUID;

public record EventResponse(UUID id, String title, String description, String organizerType, UUID organizerId,
        String createdByUserId, String imageUrl, String location, Instant startsAt, Instant endsAt, String category,
        Integer capacity, Instant registrationDeadline, RegistrationMode registrationMode, Long price,
        String externalUrl, boolean attendanceEnabled, AttendanceMode attendanceMode, EventStatus status,
        Instant createdAt) {

    public static EventResponse from(Event event) {
        return new EventResponse(event.getId(), event.getTitle(), event.getDescription(), event.getOrganizerType(),
                event.getOrganizerId(), event.getCreatedByUserId(), event.getImageUrl(), event.getLocation(),
                event.getStartsAt(), event.getEndsAt(), event.getCategory(), event.getCapacity(),
                event.getRegistrationDeadline(), event.getRegistrationMode(), event.getPrice(), event.getExternalUrl(),
                event.isAttendanceEnabled(), event.getAttendanceMode(), event.getStatus(), event.getCreatedAt());
    }

    public static EventResponse from(EventView event) {
        return new EventResponse(UUID.fromString(event.id()), event.title(), event.description(), event.organizerType(),
                UUID.fromString(event.organizerId()), event.createdByUserId(), event.imageUrl(), event.location(),
                event.startsAt(), event.endsAt(), event.category(), event.capacity(), event.registrationDeadline(),
                event.registrationMode(), event.price(), event.externalUrl(), event.attendanceEnabled(),
                event.attendanceMode(), event.status(), event.createdAt());
    }
}

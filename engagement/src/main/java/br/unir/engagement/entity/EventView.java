package br.unir.engagement.entity;

import br.unir.engagement.dto.EventProjectionPayload;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "event_views")
public record EventView(@Id String id, long aggregateVersion, String title, String description, String organizerType,
        String organizerId, String createdByUserId, String imageUrl, String location, java.time.Instant startsAt,
        java.time.Instant endsAt, String category, Integer capacity, java.time.Instant registrationDeadline,
        RegistrationMode registrationMode, Long price, String externalUrl, boolean attendanceEnabled,
        AttendanceMode attendanceMode, EventStatus status, java.time.Instant createdAt) {

    public static EventView from(EventProjectionPayload event) {
        return new EventView(event.eventId().toString(), event.aggregateVersion(), event.title(), event.description(),
                event.organizerType(), event.organizerId().toString(), event.createdByUserId(), event.imageUrl(),
                event.location(), event.startsAt(), event.endsAt(), event.category(), event.capacity(),
                event.registrationDeadline(), event.registrationMode(), event.price(), event.externalUrl(),
                event.attendanceEnabled(), event.attendanceMode(), event.status(), event.createdAt());
    }
}

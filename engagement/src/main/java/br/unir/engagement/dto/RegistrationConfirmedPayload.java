package br.unir.engagement.dto;

import br.unir.engagement.entity.AttendanceMode;
import java.time.Instant;
import java.util.UUID;

/**
 * Version 1 integration contract sent to Access after an eligible registration
 * is confirmed.
 */
public record RegistrationConfirmedPayload(UUID registrationId, UUID eventId, String userId, boolean attendanceEnabled,
        AttendanceMode attendanceMode, String eventTitle, Instant startsAt, Instant endsAt) {

    public static final String EVENT_TYPE = "RegistrationConfirmed";
    public static final String ROUTING_KEY = "engagement.registration.confirmed.v1";
}

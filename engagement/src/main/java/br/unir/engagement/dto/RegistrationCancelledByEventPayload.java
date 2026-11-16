package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

/** Registration cancellation notification consumed by Payment. */
public record RegistrationCancelledByEventPayload(UUID registrationId, UUID eventId, String userId,
        Instant cancelledAt) {

    public static final String EVENT_TYPE = "RegistrationCancelledByEvent";
    public static final String ROUTING_KEY = "engagement.registration.cancelled-by-event.v1";
}

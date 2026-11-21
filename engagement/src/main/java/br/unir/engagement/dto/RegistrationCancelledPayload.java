package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Notifies Access that a confirmed participant cancelled their own
 * registration.
 */
public record RegistrationCancelledPayload(UUID registrationId, UUID eventId, String userId, Instant cancelledAt) {

    public static final String EVENT_TYPE = "RegistrationCancelled";
    public static final String ROUTING_KEY = "engagement.registration.cancelled.v1";
}

package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

/** Event cancellation notification consumed by Access. */
public record EventCancelledPayload(UUID eventId, Instant cancelledAt) {

    public static final String EVENT_TYPE = "EventCancelled";
    public static final String ROUTING_KEY = "engagement.event.cancelled.v1";
}

package br.unir.engagement.dto;

/** Internal v1 contract identifiers for the Event read-model projection. */
public final class EventProjectionEvents {

    public static final String CREATED = "EventProjectionCreated";
    public static final String UPDATED = "EventProjectionUpdated";
    public static final String CANCELLED = "EventProjectionCancelled";
    public static final String CREATED_ROUTING_KEY = "engagement.event.projection.created.v1";
    public static final String UPDATED_ROUTING_KEY = "engagement.event.projection.updated.v1";
    public static final String CANCELLED_ROUTING_KEY = "engagement.event.projection.cancelled.v1";

    private EventProjectionEvents() {
    }
}

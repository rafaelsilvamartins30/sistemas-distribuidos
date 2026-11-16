package br.unir.engagement.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;

public record IntegrationEventEnvelope(UUID messageId, String eventType, String aggregateType, UUID aggregateId,
        Instant occurredAt, int schemaVersion, JsonNode payloadJson) {
}

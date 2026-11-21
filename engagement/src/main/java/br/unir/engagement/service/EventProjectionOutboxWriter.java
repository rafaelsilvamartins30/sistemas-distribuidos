package br.unir.engagement.service;

import br.unir.engagement.dto.EventProjectionPayload;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.repository.OutboxRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class EventProjectionOutboxWriter {

    private final OutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;

    public EventProjectionOutboxWriter(OutboxRepository outboxRepository, ObjectMapper objectMapper) {
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper.copy();
    }

    public void append(Event event, String eventType, Instant occurredAt) {
        try {
            this.outboxRepository.saveAndFlush(new OutboxEvent(UUID.randomUUID(), "Event", event.getId(), eventType,
                    this.objectMapper.writeValueAsString(EventProjectionPayload.from(event)), occurredAt));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize " + eventType + " v1", exception);
        }
    }
}

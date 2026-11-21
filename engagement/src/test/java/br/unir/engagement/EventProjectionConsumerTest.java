package br.unir.engagement;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

import br.unir.engagement.dto.EventProjectionEvents;
import br.unir.engagement.dto.EventProjectionPayload;
import br.unir.engagement.dto.IntegrationEventEnvelope;
import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.service.EventProjectionConsumer;
import br.unir.engagement.service.EventProjectionStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;

class EventProjectionConsumerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final EventProjectionStore projectionStore = mock(EventProjectionStore.class);
    private final Channel channel = mock(Channel.class);

    @Test
    void persistsProjectionBeforeAcknowledgingMessage() throws Exception {
        EventProjectionPayload payload = payload();
        EventProjectionConsumer consumer = new EventProjectionConsumer(this.objectMapper, this.projectionStore);

        consumer.receive(message(payload, EventProjectionEvents.CREATED, 1), this.channel);

        InOrder order = inOrder(this.projectionStore, this.channel);
        order.verify(this.projectionStore).apply(payload);
        order.verify(this.channel).basicAck(0L, false);
    }

    @Test
    void requeuesWhenMongoPersistenceFails() throws Exception {
        EventProjectionPayload payload = payload();
        doThrow(new IllegalStateException("Mongo unavailable")).when(this.projectionStore)
                .apply(any(EventProjectionPayload.class));

        new EventProjectionConsumer(this.objectMapper, this.projectionStore)
                .receive(message(payload, EventProjectionEvents.CREATED, 1), this.channel);

        verify(this.channel).basicNack(0L, false, true);
    }

    @Test
    void deadLettersUnsupportedSchemaVersion() throws Exception {
        EventProjectionPayload payload = payload();

        new EventProjectionConsumer(this.objectMapper, this.projectionStore)
                .receive(message(payload, EventProjectionEvents.CREATED, 2), this.channel);

        verify(this.channel).basicReject(0L, false);
    }

    private Message message(EventProjectionPayload payload, String eventType, int schemaVersion) throws Exception {
        IntegrationEventEnvelope envelope = new IntegrationEventEnvelope(UUID.randomUUID(), eventType, "Event",
                payload.eventId(), Instant.now(), schemaVersion, this.objectMapper.valueToTree(payload));
        MessageProperties properties = new MessageProperties();
        properties.setDeliveryTag(0L);
        properties.setMessageId(envelope.messageId().toString());
        return new Message(this.objectMapper.writeValueAsBytes(envelope), properties);
    }

    private static EventProjectionPayload payload() {
        Instant startsAt = Instant.parse("2027-06-15T17:00:00Z");
        return new EventProjectionPayload(UUID.randomUUID(), 0, "Evento", "Descrição", "UNIVERSITY", UUID.randomUUID(),
                "creator", null, "Auditório", startsAt, startsAt.plusSeconds(3600), "ACADEMIC", 20,
                startsAt.minusSeconds(60), RegistrationMode.INTERNAL_FREE, null, null, true,
                AttendanceMode.PARTICIPANT_SCANS_EVENT, EventStatus.ACTIVE, Instant.parse("2027-01-01T12:00:00Z"));
    }
}

package br.unir.engagement.service;

import br.unir.engagement.config.RabbitMqConfiguration;
import br.unir.engagement.dto.EventProjectionEvents;
import br.unir.engagement.dto.EventProjectionPayload;
import br.unir.engagement.dto.IntegrationEventEnvelope;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class EventProjectionConsumer {

    private static final Logger LOGGER = LoggerFactory.getLogger(EventProjectionConsumer.class);
    private static final Set<String> EVENT_TYPES = Set.of(EventProjectionEvents.CREATED, EventProjectionEvents.UPDATED,
            EventProjectionEvents.CANCELLED);
    private static final long RETRY_DELAY_MILLIS = 1000;

    private final ObjectMapper objectMapper;
    private final EventProjectionStore projectionStore;

    public EventProjectionConsumer(ObjectMapper objectMapper, EventProjectionStore projectionStore) {
        this.objectMapper = objectMapper.copy();
        this.projectionStore = projectionStore;
    }

    @RabbitListener(queues = RabbitMqConfiguration.ENGAGEMENT_EVENT_PROJECTIONS_QUEUE, autoStartup = "${engagement.event-projection.consumer-enabled:true}")
    public void receive(Message message, Channel channel) throws IOException {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();
        try {
            IntegrationEventEnvelope envelope = this.objectMapper.readValue(message.getBody(),
                    IntegrationEventEnvelope.class);
            this.validateEnvelope(envelope);
            EventProjectionPayload payload = this.objectMapper.treeToValue(envelope.payloadJson(),
                    EventProjectionPayload.class);
            if (payload.eventId() == null || !envelope.aggregateId().equals(payload.eventId())
                    || payload.aggregateVersion() < 0 || payload.title() == null || payload.description() == null
                    || payload.organizerType() == null || payload.organizerId() == null || payload.location() == null
                    || payload.startsAt() == null || payload.endsAt() == null || payload.category() == null
                    || payload.registrationDeadline() == null || payload.registrationMode() == null
                    || payload.status() == null || payload.createdAt() == null) {
                throw new InvalidEventProjectionMessageException("Event projection identifiers/version are invalid");
            }
            this.projectionStore.apply(payload);
            long lagMillis = Duration.between(envelope.occurredAt(), Instant.now()).toMillis();
            LOGGER.info("Projected event {} version {} with lag_ms={}", payload.eventId(), payload.aggregateVersion(),
                    lagMillis);
            channel.basicAck(deliveryTag, false);
        } catch (InvalidEventProjectionMessageException | JsonProcessingException exception) {
            LOGGER.error("Rejecting invalid event projection message {}: {}",
                    message.getMessageProperties().getMessageId(), exception.getMessage());
            channel.basicReject(deliveryTag, false);
        } catch (RuntimeException exception) {
            LOGGER.warn("Event projection message {} failed and will be retried: {}",
                    message.getMessageProperties().getMessageId(), exception.getMessage());
            try {
                Thread.sleep(RETRY_DELAY_MILLIS);
            } catch (InterruptedException interruptedException) {
                Thread.currentThread().interrupt();
            }
            channel.basicNack(deliveryTag, false, true);
        }
    }

    private void validateEnvelope(IntegrationEventEnvelope envelope) {
        if (envelope == null || envelope.schemaVersion() != 1 || !"Event".equals(envelope.aggregateType())
                || envelope.aggregateId() == null || envelope.occurredAt() == null
                || !EVENT_TYPES.contains(envelope.eventType()) || envelope.payloadJson() == null) {
            throw new InvalidEventProjectionMessageException("Unsupported or incomplete event projection envelope");
        }
    }
}

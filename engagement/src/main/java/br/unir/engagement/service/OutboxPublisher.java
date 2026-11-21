package br.unir.engagement.service;

import br.unir.engagement.config.RabbitMqConfiguration;
import br.unir.engagement.dto.IntegrationEventEnvelope;
import br.unir.engagement.dto.PaymentConfirmedPayload;
import br.unir.engagement.dto.RefundRequestedPayload;
import br.unir.engagement.dto.RegistrationConfirmedPayload;
import br.unir.engagement.dto.RegistrationPaymentRequestedPayload;
import br.unir.engagement.dto.EventCancelledPayload;
import br.unir.engagement.dto.EventProjectionEvents;
import br.unir.engagement.dto.RegistrationCancelledByEventPayload;
import br.unir.engagement.dto.RegistrationCancelledPayload;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.repository.OutboxRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitOperations;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "engagement.outbox.enabled", havingValue = "true", matchIfMissing = true)
public class OutboxPublisher {

    private static final Logger LOGGER = LoggerFactory.getLogger(OutboxPublisher.class);
    private static final long CONFIRM_TIMEOUT_SECONDS = 5;

    private final OutboxRepository outboxRepository;
    private final RabbitOperations rabbitTemplate;
    private final ObjectMapper objectMapper;

    public OutboxPublisher(OutboxRepository outboxRepository, RabbitOperations rabbitTemplate,
            ObjectMapper objectMapper) {
        this.outboxRepository = outboxRepository;
        this.rabbitTemplate = rabbitTemplate;
        this.objectMapper = objectMapper.copy();
    }

    @Scheduled(fixedDelayString = "${engagement.outbox.poll-interval-ms:1000}")
    public void publishPendingEvents() {
        for (OutboxEvent event : this.outboxRepository.findTop50ByPublishedAtIsNullOrderByCreatedAtAsc()) {
            this.publish(event);
        }
    }

    private void publish(OutboxEvent event) {
        try {
            IntegrationEventEnvelope envelope = new IntegrationEventEnvelope(event.getId(), event.getEventType(),
                    event.getAggregateType(), event.getAggregateId(), event.getCreatedAt(), 1,
                    this.objectMapper.readTree(event.getPayloadJson()));
            Message message = MessageBuilder.withBody(this.objectMapper.writeValueAsBytes(envelope))
                    .setContentType(MessageProperties.CONTENT_TYPE_JSON).setDeliveryMode(MessageDeliveryMode.PERSISTENT)
                    .setMessageId(event.getId().toString()).build();
            CorrelationData correlationData = new CorrelationData(event.getId().toString());

            String routingKey = switch (event.getEventType()) {
                case RegistrationPaymentRequestedPayload.EVENT_TYPE -> RegistrationPaymentRequestedPayload.ROUTING_KEY;
                case PaymentConfirmedPayload.EVENT_TYPE -> PaymentConfirmedPayload.ROUTING_KEY;
                case RefundRequestedPayload.EVENT_TYPE -> RefundRequestedPayload.ROUTING_KEY;
                case RegistrationConfirmedPayload.EVENT_TYPE -> RegistrationConfirmedPayload.ROUTING_KEY;
                case EventCancelledPayload.EVENT_TYPE -> EventCancelledPayload.ROUTING_KEY;
                case EventProjectionEvents.CREATED -> EventProjectionEvents.CREATED_ROUTING_KEY;
                case EventProjectionEvents.UPDATED -> EventProjectionEvents.UPDATED_ROUTING_KEY;
                case EventProjectionEvents.CANCELLED -> EventProjectionEvents.CANCELLED_ROUTING_KEY;
                case RegistrationCancelledByEventPayload.EVENT_TYPE -> RegistrationCancelledByEventPayload.ROUTING_KEY;
                case RegistrationCancelledPayload.EVENT_TYPE -> RegistrationCancelledPayload.ROUTING_KEY;
                default -> throw new IllegalArgumentException("Unsupported Outbox event type: " + event.getEventType());
            };
            this.rabbitTemplate.send(RabbitMqConfiguration.EXCHANGE_NAME, routingKey, message, correlationData);
            CorrelationData.Confirm confirm = correlationData.getFuture().get(CONFIRM_TIMEOUT_SECONDS,
                    TimeUnit.SECONDS);
            if (!confirm.isAck() || correlationData.getReturned() != null) {
                throw new IllegalStateException("RabbitMQ did not route and confirm the event");
            }

            event.markPublished(Instant.now());
            this.outboxRepository.saveAndFlush(event);
        } catch (com.fasterxml.jackson.core.JsonProcessingException | InterruptedException | ExecutionException
                | TimeoutException | RuntimeException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            LOGGER.warn("Outbox event {} remains unpublished and will be retried: {}", event.getId(),
                    exception.getMessage());
        }
    }
}

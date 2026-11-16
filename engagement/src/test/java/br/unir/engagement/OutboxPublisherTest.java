package br.unir.engagement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.unir.engagement.config.RabbitMqConfiguration;
import br.unir.engagement.dto.RegistrationPaymentRequestedPayload;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.repository.OutboxRepository;
import br.unir.engagement.service.OutboxPublisher;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

class OutboxPublisherTest {

    private final OutboxRepository outboxRepository = mock(OutboxRepository.class);
    private final RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    void publishesVersionOneEnvelopeAndMarksOnlyAfterRoutedBrokerConfirmation() throws Exception {
        OutboxEvent event = outboxEvent();
        when(this.outboxRepository.findTop50ByPublishedAtIsNullOrderByCreatedAtAsc()).thenReturn(List.of(event));
        doAnswer(invocation -> {
            CorrelationData correlation = invocation.getArgument(3);
            correlation.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(this.rabbitTemplate).send(eq(RabbitMqConfiguration.EXCHANGE_NAME),
                eq(RegistrationPaymentRequestedPayload.ROUTING_KEY), any(Message.class), any(CorrelationData.class));

        new OutboxPublisher(this.outboxRepository, this.rabbitTemplate, this.objectMapper).publishPendingEvents();

        var messageCaptor = org.mockito.ArgumentCaptor.forClass(Message.class);
        var correlationCaptor = org.mockito.ArgumentCaptor.forClass(CorrelationData.class);
        verify(this.rabbitTemplate).send(eq(RabbitMqConfiguration.EXCHANGE_NAME),
                eq(RegistrationPaymentRequestedPayload.ROUTING_KEY), messageCaptor.capture(),
                correlationCaptor.capture());
        JsonNode envelope = this.objectMapper.readTree(messageCaptor.getValue().getBody());
        assertEquals(event.getId().toString(), envelope.get("messageId").asText());
        assertEquals("RegistrationPaymentRequested", envelope.get("eventType").asText());
        assertEquals("Registration", envelope.get("aggregateType").asText());
        assertEquals(event.getAggregateId().toString(), envelope.get("aggregateId").asText());
        assertEquals(1, envelope.get("schemaVersion").asInt());
        assertEquals(2500, envelope.get("payloadJson").get("amountMinor").asLong());
        assertEquals(event.getId().toString(), correlationCaptor.getValue().getId());
        org.junit.jupiter.api.Assertions.assertNotNull(event.getPublishedAt());
        verify(this.outboxRepository).saveAndFlush(event);
    }

    @Test
    void keepsUnconfirmedEventPendingForRetry() {
        OutboxEvent event = outboxEvent();
        when(this.outboxRepository.findTop50ByPublishedAtIsNullOrderByCreatedAtAsc()).thenReturn(List.of(event));
        doAnswer(invocation -> {
            CorrelationData correlation = invocation.getArgument(3);
            correlation.getFuture().complete(new CorrelationData.Confirm(false, "broker nack"));
            return null;
        }).when(this.rabbitTemplate).send(eq(RabbitMqConfiguration.EXCHANGE_NAME),
                eq(RegistrationPaymentRequestedPayload.ROUTING_KEY), any(Message.class), any(CorrelationData.class));

        new OutboxPublisher(this.outboxRepository, this.rabbitTemplate, this.objectMapper).publishPendingEvents();

        assertNull(event.getPublishedAt());
        verify(this.outboxRepository, never()).saveAndFlush(any(OutboxEvent.class));
    }

    @Test
    void keepsUnroutableEventPendingForRetry() {
        OutboxEvent event = outboxEvent();
        when(this.outboxRepository.findTop50ByPublishedAtIsNullOrderByCreatedAtAsc()).thenReturn(List.of(event));
        doAnswer(invocation -> {
            CorrelationData correlation = invocation.getArgument(3);
            correlation.setReturned(new org.springframework.amqp.core.ReturnedMessage(
                    new Message(new byte[0], new org.springframework.amqp.core.MessageProperties()), 312, "NO_ROUTE",
                    RabbitMqConfiguration.EXCHANGE_NAME, RegistrationPaymentRequestedPayload.ROUTING_KEY));
            correlation.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(this.rabbitTemplate).send(eq(RabbitMqConfiguration.EXCHANGE_NAME),
                eq(RegistrationPaymentRequestedPayload.ROUTING_KEY), any(Message.class), any(CorrelationData.class));

        new OutboxPublisher(this.outboxRepository, this.rabbitTemplate, this.objectMapper).publishPendingEvents();

        assertNull(event.getPublishedAt());
        verify(this.outboxRepository, never()).saveAndFlush(any(OutboxEvent.class));
    }

    private OutboxEvent outboxEvent() {
        UUID registrationId = UUID.randomUUID();
        String payload = """
                {"registrationId":"%s","eventId":"%s","userId":"keycloak-sub","amountMinor":2500,
                 "currency":"BRL","paymentDeadlineAt":"2026-11-16T15:10:00Z",
                 "reservationExpiresAt":"2026-11-16T15:15:00Z"}
                """.formatted(registrationId, UUID.randomUUID());
        return new OutboxEvent(UUID.randomUUID(), "Registration", registrationId,
                RegistrationPaymentRequestedPayload.EVENT_TYPE, payload, Instant.parse("2026-11-16T15:00:00Z"));
    }
}

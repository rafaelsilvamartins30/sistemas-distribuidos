package br.unir.engagement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.unir.engagement.config.RabbitMqConfiguration;
import br.unir.engagement.dto.IntegrationEventEnvelope;
import br.unir.engagement.dto.PaymentConfirmedPayload;
import br.unir.engagement.dto.RegistrationConfirmedPayload;
import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.entity.RegistrationStatus;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.repository.OutboxRepository;
import br.unir.engagement.service.EventCancellationService;
import br.unir.engagement.service.EventProjectionStore;
import br.unir.engagement.service.RegistrationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Opt-in end-to-end probe for the real local databases and RabbitMQ. It uses
 * random IDs and keeps its records so the persisted saga history can be
 * inspected after the run.
 */
@EnabledIfEnvironmentVariable(named = "UNIR_LIVE_SAGA_TESTS", matches = "true")
@SpringBootTest
class EventCancellationLiveIntegrationTest {

    @MockitoBean
    private EventProjectionStore eventProjectionStore;

    private static final String PAYMENT_DB = "UNIR_PAYMENT_JDBC_URL";
    private static final String ACCESS_DB = "UNIR_ACCESS_JDBC_URL";
    private static final String ACCESS_QUEUE = "access.registration-confirmed";
    private static final Duration WAIT_LIMIT = Duration.ofSeconds(60);

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private RegistrationService registrationService;

    @Autowired
    private EventCancellationService eventCancellationService;

    @Autowired
    private OutboxRepository outboxRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @DynamicPropertySource
    static void liveProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",
                () -> environment("UNIR_ENGAGEMENT_JDBC_URL", "jdbc:postgresql://localhost:15434/unir_engagement"));
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.datasource.username", () -> environment("UNIR_TEST_DB_USERNAME", "unir"));
        registry.add("spring.datasource.password", () -> environment("UNIR_TEST_DB_PASSWORD", ""));
        registry.add("spring.flyway.target", () -> "13");
        registry.add("spring.flyway.locations", () -> "classpath:db/migration");
        registry.add("engagement.outbox.enabled", () -> "false");
        registry.add("spring.rabbitmq.host", () -> environment("UNIR_RABBITMQ_HOST", "localhost"));
        registry.add("spring.rabbitmq.port", () -> environment("UNIR_RABBITMQ_PORT", "5672"));
        registry.add("spring.rabbitmq.username", () -> environment("UNIR_RABBITMQ_USERNAME", "unir"));
        registry.add("spring.rabbitmq.password", () -> environment("UNIR_RABBITMQ_PASSWORD", "unir-local-only"));
        registry.add("spring.rabbitmq.listener.simple.auto-startup", () -> "false");
    }

    @Test
    void paidCancellationRefundsAndInvalidatesAccessDespiteDuplicateAndLateMessages() throws Exception {
        UUID eventId = UUID.randomUUID();
        String userId = "kc-live-cancel-" + UUID.randomUUID();
        Event event = paidEvent(eventId, true);
        this.eventRepository.saveAndFlush(event);
        var registration = this.registrationService.register(eventId, userId);
        UUID registrationId = registration.id();

        await("Payment creates one pending charge", () -> "PENDING".equals(paymentStatus(registrationId)));
        UUID chargeId = paymentChargeId(registrationId);
        assertNotNull(chargeId);

        confirmPayment(registrationId);

        await("Engagement confirms the registration",
                () -> RegistrationStatus.CONFIRMED.name().equals(engagementRegistrationStatus(registrationId)));
        await("Access grants attendance eligibility",
                () -> "OPEN:ELIGIBLE".equals(accessSessionAndEntry(eventId, userId)));

        this.eventCancellationService.cancel(eventId);

        await("Payment refunds the captured charge", () -> "REFUNDED".equals(paymentStatus(registrationId)));
        await("Engagement records the completed cancellation refund",
                () -> "COMPLETED".equals(engagementRefundStatus(registrationId)));
        await("Access cancels the session and eligibility",
                () -> "CANCELLED:CANCELLED".equals(accessSessionAndEntry(eventId, userId)));

        long paymentQueueDepth = queueDepth(RabbitMqConfiguration.PAYMENT_REGISTRATION_CANCELLED_QUEUE);
        long accessQueueDepth = queueDepth(ACCESS_QUEUE);
        replayOutbox(eventId, "EventCancelled", "engagement.event.cancelled.v1", null);
        replayOutbox(registrationId, "RegistrationCancelledByEvent", "engagement.registration.cancelled-by-event.v1",
                null);
        await("duplicate cancellation deliveries are acknowledged",
                () -> queueDepth(RabbitMqConfiguration.PAYMENT_REGISTRATION_CANCELLED_QUEUE) <= paymentQueueDepth
                        && queueDepth(ACCESS_QUEUE) <= accessQueueDepth);

        OutboxEvent registrationConfirmed = this.outboxRepository.findByAggregateIdOrderByCreatedAtAsc(registrationId)
                .stream().filter(message -> RegistrationConfirmedPayload.EVENT_TYPE.equals(message.getEventType()))
                .findFirst().orElseThrow();
        UUID delayedRegistrationConfirmedMessageId = replay(registrationConfirmed,
                RegistrationConfirmedPayload.ROUTING_KEY, UUID.randomUUID());

        PaymentOutboxRow paymentConfirmed = paymentConfirmationOutbox(chargeId);
        var lateConfirmation = new IntegrationEventEnvelope(UUID.randomUUID(), PaymentConfirmedPayload.EVENT_TYPE,
                "Charge", chargeId, paymentConfirmed.createdAt(), 1,
                this.objectMapper.readTree(paymentConfirmed.payloadJson()));
        this.rabbitTemplate.send(RabbitMqConfiguration.EXCHANGE_NAME, PaymentConfirmedPayload.ROUTING_KEY,
                integrationMessage(lateConfirmation));

        await("late confirmations are recorded without reactivation",
                () -> processedPaymentConfirmationCount(registrationId) >= 2
                        && accessProcessedMessageExists(delayedRegistrationConfirmedMessageId));
        assertEquals(EventStatus.CANCELLED.name(), engagementEventStatus(eventId));
        assertEquals(RegistrationStatus.CANCELLED_BY_EVENT.name(), engagementRegistrationStatus(registrationId));
        assertEquals("COMPLETED", engagementRefundStatus(registrationId));
        assertEquals(1, paymentEventCount(chargeId, "RefundSucceeded"));
        assertEquals(1, paymentEventCount(chargeId, "RefundRequested"));
        assertEquals(1, accessCount(eventId));
        assertEquals("CANCELLED:CANCELLED", accessSessionAndEntry(eventId, userId));
    }

    @Test
    void pendingPaymentIsCancelledWithoutCreatingARefund() throws Exception {
        UUID eventId = UUID.randomUUID();
        String userId = "kc-live-pending-cancel-" + UUID.randomUUID();
        this.eventRepository.saveAndFlush(paidEvent(eventId, false));
        var registration = this.registrationService.register(eventId, userId);
        UUID registrationId = registration.id();

        await("Payment creates the pending charge", () -> "PENDING".equals(paymentStatus(registrationId)));
        UUID chargeId = paymentChargeId(registrationId);
        assertNotNull(chargeId);

        this.eventCancellationService.cancel(eventId);

        await("Payment cancels the pending charge", () -> "CANCELLED".equals(paymentStatus(registrationId)));
        await("Access persists the event cancellation", () -> "CANCELLED".equals(accessEventState(eventId)));
        replayOutbox(registrationId, "RegistrationCancelledByEvent", "engagement.registration.cancelled-by-event.v1",
                null);
        await("duplicate pending-charge cancellation is consumed",
                () -> paymentEventCount(chargeId, "ChargeCancelled") == 1);
        assertEquals(EventStatus.CANCELLED.name(), engagementEventStatus(eventId));
        assertEquals(RegistrationStatus.CANCELLED_BY_EVENT.name(), engagementRegistrationStatus(registrationId));
        assertEquals(0, engagementRefundRecordCount(registrationId));
        assertEquals(1, paymentEventCount(chargeId, "ChargeCancelled"));
        assertEquals(0, paymentEventCount(chargeId, "RefundSucceeded"));
        assertEquals(0, accessCount(eventId));
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "UNIR_LIVE_OUTAGE_PHASE", matches = "prepare")
    void prepareConfirmedEventForConsumerOutageRecovery() throws Exception {
        UUID eventId = UUID.fromString(environment("UNIR_LIVE_OUTAGE_EVENT_ID", ""));
        String userId = environment("UNIR_LIVE_OUTAGE_USER_ID", "kc-live-outage-" + UUID.randomUUID());
        this.eventRepository.saveAndFlush(paidEvent(eventId, true));
        var registration = this.registrationService.register(eventId, userId);
        UUID registrationId = registration.id();

        await("Payment creates outage-fixture charge", () -> "PENDING".equals(paymentStatus(registrationId)));
        confirmPayment(registrationId);
        await("Engagement confirms outage-fixture registration",
                () -> RegistrationStatus.CONFIRMED.name().equals(engagementRegistrationStatus(registrationId)));
        await("Access grants outage-fixture eligibility",
                () -> "OPEN:ELIGIBLE".equals(accessSessionAndEntry(eventId, userId)));
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "UNIR_LIVE_OUTAGE_PHASE", matches = "cancel")
    void enqueueEventCancellationWhileConsumersAreOffline() throws Exception {
        UUID eventId = UUID.fromString(environment("UNIR_LIVE_OUTAGE_EVENT_ID", ""));
        UUID registrationId = registrationIdForEvent(eventId);
        String userId = registrationUserId(eventId);
        assertEquals("PAID", paymentStatus(registrationId));
        assertEquals("OPEN:ELIGIBLE", accessSessionAndEntry(eventId, userId));

        this.eventCancellationService.cancel(eventId);
        replayOutbox(eventId, "EventCancelled", "engagement.event.cancelled.v1", null);
        replayOutbox(registrationId, "RegistrationCancelledByEvent", "engagement.registration.cancelled-by-event.v1",
                null);

        assertEquals(EventStatus.CANCELLED.name(), engagementEventStatus(eventId));
        assertEquals(RegistrationStatus.CANCELLED_BY_EVENT.name(), engagementRegistrationStatus(registrationId));
        assertEquals("PAID", paymentStatus(registrationId));
        assertEquals("OPEN:ELIGIBLE", accessSessionAndEntry(eventId, userId));
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "UNIR_LIVE_OUTAGE_PHASE", matches = "verify")
    void verifyConsumerOutageRecovery() throws Exception {
        UUID eventId = UUID.fromString(environment("UNIR_LIVE_OUTAGE_EVENT_ID", ""));
        UUID registrationId = registrationIdForEvent(eventId);
        UUID chargeId = paymentChargeId(registrationId);
        String userId = registrationUserId(eventId);

        await("Payment replays queued cancellation and refunds once",
                () -> "REFUNDED".equals(paymentStatus(registrationId)));
        await("Engagement records the recovered refund result",
                () -> "COMPLETED".equals(engagementRefundStatus(registrationId)));
        await("Access replays queued cancellation",
                () -> "CANCELLED:CANCELLED".equals(accessSessionAndEntry(eventId, userId)));

        assertEquals(EventStatus.CANCELLED.name(), engagementEventStatus(eventId));
        assertEquals(1, paymentEventCount(chargeId, "RefundRequested"));
        assertEquals(1, paymentEventCount(chargeId, "RefundSucceeded"));
        assertEquals(1, accessCount(eventId));
    }

    private static Event paidEvent(UUID id, boolean attendanceEnabled) {
        Instant now = Instant.now();
        Instant startsAt = now.plus(Duration.ofDays(2));
        return new Event(id, "Evento local de cancelamento", "Registro de prova de integração.", "UNIVERSITY",
                UUID.randomUUID(), null, "Auditório Central", startsAt, startsAt.plus(Duration.ofHours(2)), "ACADEMIC",
                4, startsAt.minusSeconds(60), RegistrationMode.INTERNAL_PAID, 2500L, null, attendanceEnabled,
                attendanceEnabled ? AttendanceMode.PARTICIPANT_SCANS_EVENT : null, EventStatus.ACTIVE, now);
    }

    private UUID replayOutbox(UUID aggregateId, String eventType, String routingKey, UUID messageIdOverride)
            throws Exception {
        OutboxEvent event = this.outboxRepository.findByAggregateIdOrderByCreatedAtAsc(aggregateId).stream()
                .filter(message -> eventType.equals(message.getEventType())).findFirst().orElseThrow();
        return replay(event, routingKey, messageIdOverride);
    }

    private UUID replay(OutboxEvent event, String routingKey, UUID messageIdOverride) throws Exception {
        UUID messageId = messageIdOverride == null ? event.getId() : messageIdOverride;
        var envelope = new IntegrationEventEnvelope(messageId, event.getEventType(), event.getAggregateType(),
                event.getAggregateId(), event.getCreatedAt(), 1, this.objectMapper.readTree(event.getPayloadJson()));
        this.rabbitTemplate.send(RabbitMqConfiguration.EXCHANGE_NAME, routingKey, integrationMessage(envelope));
        return messageId;
    }

    private void confirmPayment(UUID registrationId) throws Exception {
        HttpRequest confirm = HttpRequest
                .newBuilder(URI.create(environment("UNIR_PAYMENT_HTTP_URL", "http://localhost:18086")
                        + "/local/simulated-payments/" + registrationId + "/confirm"))
                .header("Authorization", "Bearer local-saga-test").header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"paidAt\":\"" + Instant.now() + "\"}")).build();
        HttpResponse<String> confirmation = HttpClient.newHttpClient().send(confirm,
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, confirmation.statusCode(), confirmation.body());
    }

    private long queueDepth(String queueName) {
        return this.rabbitTemplate.execute(channel -> channel.messageCount(queueName));
    }

    private Message integrationMessage(IntegrationEventEnvelope envelope) throws Exception {
        return MessageBuilder.withBody(this.objectMapper.writeValueAsBytes(envelope))
                .setContentType(MessageProperties.CONTENT_TYPE_JSON).setDeliveryMode(MessageDeliveryMode.PERSISTENT)
                .setMessageId(envelope.messageId().toString()).build();
    }

    private static void await(String description, BooleanSupplier condition) throws InterruptedException {
        long deadline = System.nanoTime() + WAIT_LIMIT.toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            TimeUnit.MILLISECONDS.sleep(200);
        }
        throw new AssertionError("Timed out waiting for " + description);
    }

    private static String environment(String key, String defaultValue) {
        return System.getenv().getOrDefault(key, defaultValue);
    }

    private static Connection database(String variable, String defaultUrl) throws SQLException {
        return DriverManager.getConnection(environment(variable, defaultUrl),
                environment("UNIR_TEST_DB_USERNAME", "unir"), environment("UNIR_TEST_DB_PASSWORD", ""));
    }

    private static String paymentStatus(UUID registrationId) {
        return queryText(PAYMENT_DB, "jdbc:postgresql://localhost:15435/unir_payment", """
                SELECT status FROM charge_projections WHERE reference_type = 'REGISTRATION' AND reference_id = ?
                """, registrationId);
    }

    private static UUID paymentChargeId(UUID registrationId) {
        String id = queryText(PAYMENT_DB, "jdbc:postgresql://localhost:15435/unir_payment",
                """
                        SELECT charge_id::text FROM charge_projections WHERE reference_type = 'REGISTRATION' AND reference_id = ?
                        """,
                registrationId);
        return id == null ? null : UUID.fromString(id);
    }

    private static long paymentEventCount(UUID chargeId, String eventType) {
        return queryLong(PAYMENT_DB, "jdbc:postgresql://localhost:15435/unir_payment",
                "SELECT count(*) FROM payment_events WHERE aggregate_id = ? AND event_type = ?", chargeId, eventType);
    }

    private static PaymentOutboxRow paymentConfirmationOutbox(UUID chargeId) {
        try (Connection connection = database(PAYMENT_DB, "jdbc:postgresql://localhost:15435/unir_payment");
                PreparedStatement statement = connection.prepareStatement("""
                        SELECT id::text, aggregate_id::text, payload_json::text, created_at
                        FROM payment_outbox WHERE aggregate_id = ? AND event_type = 'PaymentConfirmed'
                        ORDER BY created_at LIMIT 1
                        """)) {
            statement.setObject(1, chargeId);
            try (ResultSet rows = statement.executeQuery()) {
                if (!rows.next()) {
                    throw new AssertionError("PaymentConfirmed Outbox row not found for " + chargeId);
                }
                return new PaymentOutboxRow(UUID.fromString(rows.getString("id")),
                        UUID.fromString(rows.getString("aggregate_id")), rows.getString("payload_json"),
                        rows.getTimestamp("created_at").toInstant());
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Could not inspect Payment Outbox", exception);
        }
    }

    private static long processedPaymentConfirmationCount(UUID registrationId) {
        return queryLong("UNIR_ENGAGEMENT_JDBC_URL", "jdbc:postgresql://localhost:15434/unir_engagement",
                "SELECT count(*) FROM processed_payment_confirmations WHERE registration_id = ?", registrationId);
    }

    private static String engagementRegistrationStatus(UUID registrationId) {
        return queryText("UNIR_ENGAGEMENT_JDBC_URL", "jdbc:postgresql://localhost:15434/unir_engagement",
                "SELECT status FROM registrations WHERE id = ?", registrationId);
    }

    private static String engagementEventStatus(UUID eventId) {
        return queryText("UNIR_ENGAGEMENT_JDBC_URL", "jdbc:postgresql://localhost:15434/unir_engagement",
                "SELECT status FROM events WHERE id = ?", eventId);
    }

    private static String engagementRefundStatus(UUID registrationId) {
        return queryText("UNIR_ENGAGEMENT_JDBC_URL", "jdbc:postgresql://localhost:15434/unir_engagement",
                "SELECT refund_status FROM event_cancellation_refunds WHERE registration_id = ?", registrationId);
    }

    private static long engagementRefundRecordCount(UUID registrationId) {
        return queryLong("UNIR_ENGAGEMENT_JDBC_URL", "jdbc:postgresql://localhost:15434/unir_engagement",
                "SELECT count(*) FROM event_cancellation_refunds WHERE registration_id = ?", registrationId);
    }

    private static String accessSessionAndEntry(UUID eventId, String userId) {
        return queryText(ACCESS_DB, "jdbc:postgresql://localhost:15436/unir_access", """
                SELECT s.status || ':' || e.status
                FROM attendance_sessions s
                JOIN attendance_entries e ON e.session_id = s.id
                WHERE s.source_type = 'EVENT' AND s.source_id = ? AND e.user_id = ?
                """, eventId, userId);
    }

    private static String accessEventState(UUID eventId) {
        return queryText(ACCESS_DB, "jdbc:postgresql://localhost:15436/unir_access",
                "SELECT status FROM attendance_event_states WHERE event_id = ?", eventId);
    }

    private static long accessCount(UUID eventId) {
        return queryLong(ACCESS_DB, "jdbc:postgresql://localhost:15436/unir_access", """
                SELECT count(*) FROM attendance_sessions s
                JOIN attendance_entries e ON e.session_id = s.id
                WHERE s.source_type = 'EVENT' AND s.source_id = ?
                """, eventId);
    }

    private static boolean accessProcessedMessageExists(UUID messageId) {
        return queryLong(ACCESS_DB, "jdbc:postgresql://localhost:15436/unir_access",
                "SELECT count(*) FROM processed_messages WHERE message_id = ?", messageId) == 1;
    }

    private static UUID registrationIdForEvent(UUID eventId) {
        String id = queryText("UNIR_ENGAGEMENT_JDBC_URL", "jdbc:postgresql://localhost:15434/unir_engagement",
                "SELECT id::text FROM registrations WHERE event_id = ?", eventId);
        assertNotNull(id);
        return UUID.fromString(id);
    }

    private static String registrationUserId(UUID eventId) {
        String userId = queryText("UNIR_ENGAGEMENT_JDBC_URL", "jdbc:postgresql://localhost:15434/unir_engagement",
                "SELECT user_id FROM registrations WHERE event_id = ?", eventId);
        assertNotNull(userId);
        return userId;
    }

    private static String queryText(String variable, String defaultUrl, String sql, Object... parameters) {
        try (Connection connection = database(variable, defaultUrl);
                PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, parameters);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? rows.getString(1) : null;
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Could not read local integration state", exception);
        }
    }

    private static long queryLong(String variable, String defaultUrl, String sql, Object... parameters) {
        try (Connection connection = database(variable, defaultUrl);
                PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, parameters);
            try (ResultSet rows = statement.executeQuery()) {
                assertTrue(rows.next());
                return rows.getLong(1);
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Could not count local integration state", exception);
        }
    }

    private static void bind(PreparedStatement statement, Object... parameters) throws SQLException {
        for (int index = 0; index < parameters.length; index++) {
            statement.setObject(index + 1, parameters[index]);
        }
    }

    private record PaymentOutboxRow(UUID messageId, UUID chargeId, String payloadJson, Instant createdAt) {
    }
}

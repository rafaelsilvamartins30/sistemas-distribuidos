package br.unir.engagement;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.unir.engagement.client.CampusEventOrganizerClient;
import br.unir.engagement.dto.EventOrganizerContext;
import br.unir.engagement.dto.EventOrganizerContextsResponse;
import br.unir.engagement.dto.EventProjectionEvents;
import br.unir.engagement.dto.EventProjectionPayload;
import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.EventView;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.entity.Registration;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.entity.RegistrationStatus;
import br.unir.engagement.dto.IntegrationEventEnvelope;
import br.unir.engagement.dto.PaymentConfirmedPayload;
import br.unir.engagement.dto.RefundFailedPayload;
import br.unir.engagement.dto.RefundRequestedPayload;
import br.unir.engagement.dto.RefundSucceededPayload;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.repository.OutboxRepository;
import br.unir.engagement.repository.RegistrationRepository;
import br.unir.engagement.service.RegistrationExpirationService;
import br.unir.engagement.service.EventCancellationService;
import br.unir.engagement.service.PaymentConfirmationService;
import br.unir.engagement.service.RefundResultService;
import br.unir.engagement.service.EventProjectionStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Comparator;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
class EngagementEndpointTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private RegistrationRepository registrationRepository;

    @Autowired
    private OutboxRepository outboxRepository;

    @Autowired
    private RegistrationExpirationService registrationExpirationService;

    @Autowired
    private EventCancellationService eventCancellationService;

    @Autowired
    private PaymentConfirmationService paymentConfirmationService;

    @Autowired
    private RefundResultService refundResultService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private CampusEventOrganizerClient campusOrganizerClient;

    @MockitoBean
    private EventProjectionStore eventProjectionStore;

    @BeforeEach
    void clearEvents() {
        this.jdbcTemplate.update("DELETE FROM event_cancellation_refunds");
        this.jdbcTemplate.update("DELETE FROM processed_refund_results");
        this.jdbcTemplate.update("DELETE FROM payment_compensation_cases");
        this.jdbcTemplate.update("DELETE FROM processed_payment_confirmations");
        this.outboxRepository.deleteAllInBatch();
        this.registrationRepository.deleteAllInBatch();
        this.eventRepository.deleteAllInBatch();
        when(this.eventProjectionStore.findDiscoverable(any(Instant.class), any(Pageable.class)))
                .thenAnswer(invocation -> {
                    Instant now = invocation.getArgument(0);
                    Pageable pageable = invocation.getArgument(1);
                    List<EventView> events = this.eventRepository.findAll().stream()
                            .filter(event -> event.getStatus() == EventStatus.ACTIVE)
                            .filter(event -> event.getRegistrationMode() != RegistrationMode.EXTERNAL_PAID
                                    || !event.getRegistrationDeadline().isBefore(now))
                            .sorted(Comparator.comparing(Event::getStartsAt)).map(EventProjectionPayload::from)
                            .map(EventView::from).toList();
                    int start = Math.toIntExact(pageable.getOffset());
                    int end = Math.min(start + pageable.getPageSize(), events.size());
                    List<EventView> page = start >= events.size() ? List.of() : events.subList(start, end);
                    return new PageImpl<>(page, pageable, events.size());
                });
        when(this.eventProjectionStore.findById(any(String.class)))
                .thenAnswer(invocation -> this.eventRepository.findById(UUID.fromString(invocation.getArgument(0)))
                        .map(EventProjectionPayload::from).map(EventView::from));
    }

    @Test
    void institutionalCancellationIsTerminalAndWritesPaymentAndAccessOutboxAtomically() throws Exception {
        Instant now = Instant.now();
        Event event = futurePaidEvent(4, Duration.ofDays(3), 2500L);
        this.eventRepository.saveAndFlush(event);
        UUID registrationId = UUID.randomUUID();
        UUID chargeId = UUID.randomUUID();
        UUID paymentMessageId = UUID.randomUUID();
        Registration registration = new Registration(registrationId, event.getId(), "keycloak-cancelled-user",
                RegistrationStatus.CONFIRMED, now.minusSeconds(300), now.minusSeconds(240), null, null, null);
        this.registrationRepository.saveAndFlush(registration);
        this.jdbcTemplate.update(
                """
                        INSERT INTO processed_payment_confirmations (message_id, registration_id, message_hash, processed_at, charge_id)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                paymentMessageId, registrationId, "a".repeat(64), now.minusSeconds(240), chargeId);

        this.eventCancellationService.cancel(event.getId());

        org.junit.jupiter.api.Assertions.assertEquals(EventStatus.CANCELLED,
                this.eventRepository.findById(event.getId()).orElseThrow().getStatus());
        org.junit.jupiter.api.Assertions.assertEquals(RegistrationStatus.CANCELLED_BY_EVENT,
                this.registrationRepository.findById(registrationId).orElseThrow().getStatus());
        List<OutboxEvent> messages = this.outboxRepository.findAll();
        org.junit.jupiter.api.Assertions.assertEquals(3, messages.size());
        OutboxEvent projectionCancellation = messages.stream()
                .filter(message -> "EventProjectionCancelled".equals(message.getEventType())).findFirst().orElseThrow();
        JsonNode projectionPayload = this.objectMapper.readTree(projectionCancellation.getPayloadJson());
        org.junit.jupiter.api.Assertions.assertEquals(1, projectionPayload.get("aggregateVersion").asLong());
        org.junit.jupiter.api.Assertions.assertEquals("CANCELLED", projectionPayload.get("status").asText());
        OutboxEvent eventCancellation = messages.stream()
                .filter(message -> "EventCancelled".equals(message.getEventType())).findFirst().orElseThrow();
        JsonNode eventCancellationPayload = this.objectMapper.readTree(eventCancellation.getPayloadJson());
        org.junit.jupiter.api.Assertions.assertEquals(eventCancellation.getCreatedAt(),
                Instant.parse(eventCancellationPayload.get("cancelledAt").asText()));
        OutboxEvent registrationCancellation = messages.stream()
                .filter(message -> "RegistrationCancelledByEvent".equals(message.getEventType())).findFirst()
                .orElseThrow();
        JsonNode cancellationPayload = this.objectMapper.readTree(registrationCancellation.getPayloadJson());
        org.junit.jupiter.api.Assertions.assertEquals("keycloak-cancelled-user",
                cancellationPayload.get("userId").asText());
        String trackedMessage = this.jdbcTemplate.queryForObject(
                "SELECT cancellation_message_id FROM event_cancellation_refunds WHERE registration_id = ?",
                String.class, registrationId);
        org.junit.jupiter.api.Assertions.assertEquals(registrationCancellation.getId().toString(), trackedMessage);
        org.junit.jupiter.api.Assertions.assertEquals("PENDING",
                this.jdbcTemplate.queryForObject(
                        "SELECT refund_status FROM event_cancellation_refunds WHERE registration_id = ?", String.class,
                        registrationId));

        this.eventCancellationService.cancel(event.getId());
        org.junit.jupiter.api.Assertions.assertEquals(3, this.outboxRepository.count());
    }

    @Test
    void cancellationRefundResultCanArriveBeforeTheLatePaymentConfirmation() throws Exception {
        Instant now = Instant.now();
        Event event = futurePaidEvent(2, Duration.ofDays(3), 2500L);
        this.eventRepository.saveAndFlush(event);
        UUID registrationId = UUID.randomUUID();
        Registration registration = new Registration(registrationId, event.getId(), "keycloak-late-payment-user",
                RegistrationStatus.PENDING_PAYMENT, now.minusSeconds(30), null, null, now.plusSeconds(570),
                now.plusSeconds(870));
        this.registrationRepository.saveAndFlush(registration);

        this.eventCancellationService.cancel(event.getId());

        OutboxEvent cancellation = this.outboxRepository.findByAggregateIdOrderByCreatedAtAsc(registrationId).stream()
                .filter(message -> "RegistrationCancelledByEvent".equals(message.getEventType())).findFirst()
                .orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals(0,
                this.jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM event_cancellation_refunds WHERE registration_id = ?", Integer.class,
                        registrationId));

        UUID chargeId = UUID.randomUUID();
        this.refundResultService.consume(refundSucceededMessage(chargeId, registrationId, cancellation.getId(),
                UUID.randomUUID(), 2500L, Instant.now()));
        this.paymentConfirmationService
                .consume(paymentConfirmedMessage(registration, event, chargeId, UUID.randomUUID(), now, Instant.now()));

        org.junit.jupiter.api.Assertions.assertEquals(RegistrationStatus.CANCELLED_BY_EVENT,
                this.registrationRepository.findById(registrationId).orElseThrow().getStatus());
        org.junit.jupiter.api.Assertions.assertEquals("COMPLETED",
                this.jdbcTemplate.queryForObject(
                        "SELECT refund_status FROM event_cancellation_refunds WHERE registration_id = ?", String.class,
                        registrationId));
        org.junit.jupiter.api.Assertions.assertEquals(chargeId.toString(),
                this.jdbcTemplate.queryForObject(
                        "SELECT charge_id FROM event_cancellation_refunds WHERE registration_id = ?", String.class,
                        registrationId));
    }

    @Test
    void healthEndpointReportsDatabaseConnectivity() throws Exception {
        this.mockMvc.perform(get("/health")).andExpect(status().isOk())
                .andExpect(jsonPath("$.service").value("engagement")).andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.database").value("up"));
    }

    @Test
    void unmappedEndpointsRequireAuthenticationOrAreDenied() throws Exception {
        this.mockMvc.perform(get("/activities")).andExpect(status().isUnauthorized());
    }

    @Test
    void listsPersistedEventsWithPaginationAndExcludesCancelledAndExpiredExternalEvents() throws Exception {
        Instant now = Instant.now();
        Event listed = event(UUID.randomUUID(), "Encontro de Boas-vindas", EventStatus.ACTIVE,
                RegistrationMode.INTERNAL_FREE, now.plusSeconds(3600), now.plusSeconds(7200), now.plusSeconds(600),
                null, null);
        Event cancelled = event(UUID.randomUUID(), "Evento cancelado", EventStatus.CANCELLED,
                RegistrationMode.INTERNAL_FREE, now.plusSeconds(10_800), now.plusSeconds(14_400), now.plusSeconds(600),
                null, null);
        Event expiredExternal = event(UUID.randomUUID(), "Evento externo encerrado", EventStatus.ACTIVE,
                RegistrationMode.EXTERNAL_PAID, now.plusSeconds(18_000), now.plusSeconds(21_600), now.minusSeconds(60),
                null, "https://example.org/events/expired");
        this.eventRepository.saveAllAndFlush(java.util.List.of(listed, cancelled, expiredExternal));

        this.mockMvc.perform(get("/api/v1/events?page=0&size=10").with(userJwt())).andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(10))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(listed.getId().toString()))
                .andExpect(jsonPath("$.items[0].title").value("Encontro de Boas-vindas"))
                .andExpect(jsonPath("$.items[0].registrationMode").value("INTERNAL_FREE"))
                .andExpect(jsonPath("$.items[0].attendanceEnabled").value(true));

        this.mockMvc.perform(get("/api/v1/events/{eventId}", cancelled.getId()).with(userJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void returnsPersistedEventDetailsAndNotFoundForMissingEvent() throws Exception {
        Instant startsAt = Instant.parse("2027-06-15T17:00:00Z");
        Event persisted = event(UUID.randomUUID(), "Oficina de Projetos", EventStatus.ACTIVE,
                RegistrationMode.INTERNAL_PAID, startsAt, startsAt.plusSeconds(10_800), startsAt.minusSeconds(86_400),
                2500L, null);
        this.eventRepository.saveAndFlush(persisted);

        this.mockMvc.perform(get("/api/v1/events/{eventId}", persisted.getId()).with(userJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(persisted.getId().toString()))
                .andExpect(jsonPath("$.title").value("Oficina de Projetos")).andExpect(jsonPath("$.price").value(2500))
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        this.mockMvc.perform(get("/api/v1/events/{eventId}", UUID.randomUUID()).with(userJwt()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void rejectsExternalPaidEventsWithoutNonBlankExternalUrl() {
        Instant startsAt = Instant.parse("2027-06-15T17:00:00Z");
        Event eventWithoutUrl = event(UUID.randomUUID(), "Evento externo", EventStatus.ACTIVE,
                RegistrationMode.EXTERNAL_PAID, startsAt, startsAt.plusSeconds(3600), startsAt.minusSeconds(60), null,
                "   ");

        assertThrows(DataIntegrityViolationException.class, () -> this.eventRepository.saveAndFlush(eventWithoutUrl));
    }

    @Test
    void eventQueriesRequireAnAllowedRoleAndValidPagination() throws Exception {
        this.mockMvc.perform(get("/api/v1/events")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/events").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_GUEST"))))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(get("/api/v1/events?size=101").with(userJwt())).andExpect(status().isBadRequest());
    }

    @Test
    void registersFreeEventWithKeycloakSubjectAndRejectsAnActiveDuplicate() throws Exception {
        String subject = "keycloak-subject-not-the-campus-row-uuid";
        Event event = futureFreeEvent(2, Duration.ofDays(3));
        this.eventRepository.saveAndFlush(event);

        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt(subject)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.eventId").value(event.getId().toString()))
                .andExpect(jsonPath("$.userId").value(subject)).andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.confirmedAt").isNotEmpty())
                .andExpect(jsonPath("$.event.title").value("Evento gratuito"));

        Registration stored = this.registrationRepository.findAll().getFirst();
        org.junit.jupiter.api.Assertions.assertEquals(subject, stored.getUserId());
        org.junit.jupiter.api.Assertions.assertEquals(RegistrationStatus.CONFIRMED, stored.getStatus());

        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt(subject)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("ALREADY_REGISTERED"));
        org.junit.jupiter.api.Assertions.assertEquals(1, this.registrationRepository.count());
    }

    @Test
    void concurrentRegistrationsForTheLastSeatAllowOnlyOneRequest() throws Exception {
        Event event = futureFreeEvent(1, Duration.ofDays(3));
        this.eventRepository.saveAndFlush(event);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Integer> first = executor
                    .submit(() -> registerConcurrently(event.getId(), "kc-user-a", ready, start));
            Future<Integer> second = executor
                    .submit(() -> registerConcurrently(event.getId(), "kc-user-b", ready, start));
            org.junit.jupiter.api.Assertions.assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();

            List<Integer> statuses = List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
            org.junit.jupiter.api.Assertions.assertEquals(1, statuses.stream().filter(status -> status == 201).count());
            org.junit.jupiter.api.Assertions.assertEquals(1, statuses.stream().filter(status -> status == 409).count());
            org.junit.jupiter.api.Assertions.assertEquals(1,
                    this.registrationRepository.countForEventAndStatus(event.getId(), RegistrationStatus.CONFIRMED));
        }
    }

    @Test
    void reservesPaidEventAndWritesVersionOnePaymentRequestWithTenAndFifteenMinuteDeadlines() throws Exception {
        Event event = futurePaidEvent(2, Duration.ofDays(3), 2500L);
        this.eventRepository.saveAndFlush(event);
        String subject = "keycloak-user-subject";

        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt(subject)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING_PAYMENT"))
                .andExpect(jsonPath("$.userId").value(subject)).andExpect(jsonPath("$.confirmedAt").doesNotExist())
                .andExpect(jsonPath("$.paymentDeadlineAt").isNotEmpty())
                .andExpect(jsonPath("$.reservationExpiresAt").isNotEmpty());

        Registration registration = this.registrationRepository.findAll().getFirst();
        org.junit.jupiter.api.Assertions.assertEquals(RegistrationStatus.PENDING_PAYMENT, registration.getStatus());
        org.junit.jupiter.api.Assertions.assertEquals(Duration.ofMinutes(10),
                Duration.between(registration.getRegisteredAt(), registration.getPaymentDeadlineAt()));
        org.junit.jupiter.api.Assertions.assertEquals(Duration.ofMinutes(15),
                Duration.between(registration.getRegisteredAt(), registration.getReservationExpiresAt()));

        List<OutboxEvent> outboxEvents = this.outboxRepository
                .findByAggregateIdOrderByCreatedAtAsc(registration.getId());
        org.junit.jupiter.api.Assertions.assertEquals(1, outboxEvents.size());
        OutboxEvent outboxEvent = outboxEvents.getFirst();
        org.junit.jupiter.api.Assertions.assertEquals("RegistrationPaymentRequested", outboxEvent.getEventType());
        JsonNode payload = this.objectMapper.readTree(outboxEvent.getPayloadJson());
        org.junit.jupiter.api.Assertions.assertEquals(registration.getId().toString(),
                payload.get("registrationId").asText());
        org.junit.jupiter.api.Assertions.assertEquals(event.getId().toString(), payload.get("eventId").asText());
        org.junit.jupiter.api.Assertions.assertEquals(subject, payload.get("userId").asText());
        org.junit.jupiter.api.Assertions.assertEquals(2500, payload.get("amountMinor").asLong());
        org.junit.jupiter.api.Assertions.assertEquals("BRL", payload.get("currency").asText());
        org.junit.jupiter.api.Assertions.assertEquals(registration.getPaymentDeadlineAt().toString(),
                payload.get("paymentDeadlineAt").asText());
        org.junit.jupiter.api.Assertions.assertEquals(registration.getReservationExpiresAt().toString(),
                payload.get("reservationExpiresAt").asText());

        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt(subject)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("ALREADY_REGISTERED"));
        org.junit.jupiter.api.Assertions.assertEquals(1, this.registrationRepository.count());
        org.junit.jupiter.api.Assertions.assertEquals(1, this.outboxRepository.count());
    }

    @Test
    void paidReservationsCompeteForTheLastSeatAndOnlyTheWinnerWritesOutbox() throws Exception {
        Event event = futurePaidEvent(1, Duration.ofDays(3), 1000L);
        this.eventRepository.saveAndFlush(event);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Integer> first = executor
                    .submit(() -> registerConcurrently(event.getId(), "kc-paid-user-a", ready, start));
            Future<Integer> second = executor
                    .submit(() -> registerConcurrently(event.getId(), "kc-paid-user-b", ready, start));
            org.junit.jupiter.api.Assertions.assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();

            List<Integer> statuses = List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
            org.junit.jupiter.api.Assertions.assertEquals(1, statuses.stream().filter(status -> status == 201).count());
            org.junit.jupiter.api.Assertions.assertEquals(1, statuses.stream().filter(status -> status == 409).count());
        }
        org.junit.jupiter.api.Assertions.assertEquals(1, this.registrationRepository.countCapacityOccupants(
                event.getId(), RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING_PAYMENT, Instant.now()));
        org.junit.jupiter.api.Assertions.assertEquals(1, this.outboxRepository.count());
    }

    @Test
    void freeAttendanceEnabledRegistrationWritesRegistrationConfirmedV1ToOutbox() throws Exception {
        Event event = futureFreeEvent(2, Duration.ofDays(3));
        this.eventRepository.saveAndFlush(event);

        this.mockMvc
                .perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt("keycloak-sub")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CONFIRMED"));

        Registration registration = this.registrationRepository.findAll().getFirst();
        List<OutboxEvent> events = this.outboxRepository.findByAggregateIdOrderByCreatedAtAsc(registration.getId());
        org.junit.jupiter.api.Assertions.assertEquals(1, events.size());
        OutboxEvent outboxEvent = events.getFirst();
        org.junit.jupiter.api.Assertions.assertEquals("RegistrationConfirmed", outboxEvent.getEventType());
        JsonNode payload = this.objectMapper.readTree(outboxEvent.getPayloadJson());
        org.junit.jupiter.api.Assertions.assertEquals(registration.getId().toString(),
                payload.get("registrationId").asText());
        org.junit.jupiter.api.Assertions.assertEquals(event.getId().toString(), payload.get("eventId").asText());
        org.junit.jupiter.api.Assertions.assertEquals("keycloak-sub", payload.get("userId").asText());
        org.junit.jupiter.api.Assertions.assertTrue(payload.get("attendanceEnabled").asBoolean());
        org.junit.jupiter.api.Assertions.assertEquals("PARTICIPANT_SCANS_EVENT",
                payload.get("attendanceMode").asText());
        org.junit.jupiter.api.Assertions.assertEquals(event.getTitle(), payload.get("eventTitle").asText());
        org.junit.jupiter.api.Assertions.assertEquals(event.getCreatedByUserId(),
                payload.get("eventCreatorUserId").asText());
    }

    @Test
    void freeRegistrationWithoutAttendanceDoesNotWriteRegistrationConfirmed() throws Exception {
        Instant now = Instant.now();
        Event event = new Event(UUID.randomUUID(), "Evento sem presença", "Descrição", "UNIVERSITY", UUID.randomUUID(),
                null, "Auditório Central", now.plus(Duration.ofDays(3)), now.plus(Duration.ofDays(3)).plusSeconds(3600),
                "ACADEMIC", 20, now.plus(Duration.ofDays(2)), RegistrationMode.INTERNAL_FREE, null, null, false, null,
                EventStatus.ACTIVE, now);
        this.eventRepository.saveAndFlush(event);

        this.mockMvc
                .perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt("keycloak-sub")))
                .andExpect(status().isCreated());

        org.junit.jupiter.api.Assertions.assertEquals(0, this.outboxRepository.count());
    }

    @Test
    void consumesPaymentConfirmationOnceAndPersistsConfirmedRegistration() throws Exception {
        Instant now = Instant.now();
        Event event = futurePaidEvent(2, Duration.ofDays(3), 2500L);
        this.eventRepository.saveAndFlush(event);
        Instant paymentDeadline = now.plus(Duration.ofMinutes(8));
        Instant reservationExpires = now.plus(Duration.ofMinutes(13));
        Instant paidAt = now.minusSeconds(5);
        Registration registration = new Registration(UUID.randomUUID(), event.getId(), "kc-paid-user",
                RegistrationStatus.PENDING_PAYMENT, now.minus(Duration.ofMinutes(2)), null, null, paymentDeadline,
                reservationExpires);
        this.registrationRepository.saveAndFlush(registration);
        byte[] body = paymentConfirmedMessage(registration, event, UUID.randomUUID(), UUID.randomUUID(), paidAt, now);

        this.paymentConfirmationService.consume(body);
        this.paymentConfirmationService.consume(body);

        Registration confirmed = this.registrationRepository.findById(registration.getId()).orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals(RegistrationStatus.CONFIRMED, confirmed.getStatus());
        org.junit.jupiter.api.Assertions.assertEquals(paidAt, confirmed.getConfirmedAt());
        org.junit.jupiter.api.Assertions.assertEquals(1, this.jdbcTemplate
                .queryForObject("SELECT count(*) FROM processed_payment_confirmations", Integer.class));
        org.junit.jupiter.api.Assertions.assertEquals(0,
                this.jdbcTemplate.queryForObject("SELECT count(*) FROM payment_compensation_cases", Integer.class));
        List<OutboxEvent> outboxEvents = this.outboxRepository
                .findByAggregateIdOrderByCreatedAtAsc(registration.getId());
        org.junit.jupiter.api.Assertions.assertEquals(1, outboxEvents.size());
        org.junit.jupiter.api.Assertions.assertEquals("RegistrationConfirmed", outboxEvents.getFirst().getEventType());
        JsonNode attendancePayload = this.objectMapper.readTree(outboxEvents.getFirst().getPayloadJson());
        org.junit.jupiter.api.Assertions.assertEquals("kc-paid-user", attendancePayload.get("userId").asText());
    }

    @Test
    void lateConfirmationQueuesRefundAndResultEventsPreserveTerminalRegistration() throws Exception {
        Instant now = Instant.now();
        Event event = futurePaidEvent(2, Duration.ofDays(3), 2500L);
        this.eventRepository.saveAndFlush(event);
        Instant registeredAt = now.minus(Duration.ofMinutes(20));
        Instant paymentDeadline = registeredAt.plus(Duration.ofMinutes(10));
        Instant reservationExpires = registeredAt.plus(Duration.ofMinutes(15));
        Registration registration = new Registration(UUID.randomUUID(), event.getId(), "kc-late-user",
                RegistrationStatus.PENDING_PAYMENT, registeredAt, null, null, paymentDeadline, reservationExpires);
        this.registrationRepository.saveAndFlush(registration);
        UUID chargeId = UUID.randomUUID();
        UUID paymentMessageId = UUID.randomUUID();
        byte[] body = paymentConfirmedMessage(registration, event, chargeId, paymentMessageId,
                paymentDeadline.minusSeconds(30), now);

        this.paymentConfirmationService.consume(body);

        Registration expired = this.registrationRepository.findById(registration.getId()).orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals(RegistrationStatus.PAYMENT_EXPIRED, expired.getStatus());
        org.junit.jupiter.api.Assertions.assertEquals(1,
                this.jdbcTemplate.queryForObject("SELECT count(*) FROM payment_compensation_cases", Integer.class));
        org.junit.jupiter.api.Assertions.assertEquals("RESERVATION_EXPIRED",
                this.jdbcTemplate.queryForObject(
                        "SELECT reason FROM payment_compensation_cases WHERE registration_id = ?", String.class,
                        registration.getId()));
        org.junit.jupiter.api.Assertions.assertEquals("PENDING", this.jdbcTemplate.queryForObject(
                "SELECT refund_status FROM payment_compensation_cases WHERE charge_id = ?", String.class, chargeId));
        List<OutboxEvent> refundRequests = this.outboxRepository.findByAggregateIdOrderByCreatedAtAsc(chargeId);
        org.junit.jupiter.api.Assertions.assertEquals(1, refundRequests.size());
        OutboxEvent refundRequest = refundRequests.getFirst();
        org.junit.jupiter.api.Assertions.assertEquals(RefundRequestedPayload.EVENT_TYPE, refundRequest.getEventType());
        JsonNode requestPayload = this.objectMapper.readTree(refundRequest.getPayloadJson());
        org.junit.jupiter.api.Assertions.assertEquals(paymentMessageId.toString(),
                requestPayload.get("paymentMessageId").asText());
        org.junit.jupiter.api.Assertions.assertEquals("RESERVATION_EXPIRED", requestPayload.get("reason").asText());

        byte[] failure = refundFailedMessage(chargeId, registration.getId(), refundRequest.getId(), UUID.randomUUID(),
                now.plusSeconds(1));
        this.refundResultService.consume(failure);
        this.refundResultService.consume(failure);
        org.junit.jupiter.api.Assertions.assertEquals("FAILED", this.jdbcTemplate.queryForObject(
                "SELECT refund_status FROM payment_compensation_cases WHERE charge_id = ?", String.class, chargeId));
        org.junit.jupiter.api.Assertions.assertEquals(1,
                this.jdbcTemplate.queryForObject("SELECT count(*) FROM processed_refund_results", Integer.class));

        byte[] success = refundSucceededMessage(chargeId, registration.getId(), refundRequest.getId(),
                UUID.randomUUID(), 2500, now.plusSeconds(2));
        this.refundResultService.consume(success);
        org.junit.jupiter.api.Assertions.assertEquals("COMPLETED", this.jdbcTemplate.queryForObject(
                "SELECT refund_status FROM payment_compensation_cases WHERE charge_id = ?", String.class, chargeId));
        this.refundResultService.consume(refundFailedMessage(chargeId, registration.getId(), refundRequest.getId(),
                UUID.randomUUID(), now.plusSeconds(3)));
        org.junit.jupiter.api.Assertions.assertEquals("COMPLETED", this.jdbcTemplate.queryForObject(
                "SELECT refund_status FROM payment_compensation_cases WHERE charge_id = ?", String.class, chargeId));
        org.junit.jupiter.api.Assertions.assertEquals(RegistrationStatus.PAYMENT_EXPIRED,
                this.registrationRepository.findById(registration.getId()).orElseThrow().getStatus());
        org.junit.jupiter.api.Assertions.assertEquals(0,
                this.outboxRepository.findByAggregateIdOrderByCreatedAtAsc(registration.getId()).stream()
                        .filter(eventOutbox -> "RegistrationConfirmed".equals(eventOutbox.getEventType())).count());
        org.junit.jupiter.api.Assertions.assertEquals(1, this.jdbcTemplate
                .queryForObject("SELECT count(*) FROM processed_payment_confirmations", Integer.class));
    }

    @Test
    void expiresDuePaymentReservationUnderEventLockAndAllowsAnotherUserToReserve() throws Exception {
        Event event = futurePaidEvent(1, Duration.ofDays(3), 1000L);
        this.eventRepository.saveAndFlush(event);
        Instant registeredAt = Instant.now().minus(Duration.ofMinutes(20));
        Registration expiredReservation = new Registration(UUID.randomUUID(), event.getId(), "kc-user-a",
                RegistrationStatus.PENDING_PAYMENT, registeredAt, null, null, registeredAt.plus(Duration.ofMinutes(10)),
                registeredAt.plus(Duration.ofMinutes(15)));
        this.registrationRepository.saveAndFlush(expiredReservation);

        this.registrationExpirationService.expireDueReservations();

        org.junit.jupiter.api.Assertions.assertEquals(RegistrationStatus.PAYMENT_EXPIRED,
                this.registrationRepository.findById(expiredReservation.getId()).orElseThrow().getStatus());
        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt("kc-user-b")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING_PAYMENT"));
        org.junit.jupiter.api.Assertions.assertEquals(2, this.registrationRepository.count());
        org.junit.jupiter.api.Assertions.assertEquals(1, this.outboxRepository.count());
    }

    @Test
    void listsOnlyTheAuthenticatedUsersRegistrations() throws Exception {
        Event event = futureFreeEvent(3, Duration.ofDays(3));
        this.eventRepository.saveAndFlush(event);
        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt("kc-user-a")))
                .andExpect(status().isCreated());
        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt("kc-user-b")))
                .andExpect(status().isCreated());

        this.mockMvc.perform(get("/api/v1/registrations/me?page=0&size=10").with(userJwt("kc-user-a")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].userId").value("kc-user-a"))
                .andExpect(jsonPath("$.items[0].event.id").value(event.getId().toString()));
    }

    @Test
    void cancellationChangesStatusAndKeepsHistoryUntilTheTwentyFourHourCutoff() throws Exception {
        Event event = futureFreeEvent(2, Duration.ofDays(3));
        this.eventRepository.saveAndFlush(event);
        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", event.getId()).with(userJwt("kc-user-a")))
                .andExpect(status().isCreated());
        Registration registration = this.registrationRepository.findAll().getFirst();

        this.mockMvc
                .perform(delete("/api/v1/registrations/{registrationId}", registration.getId())
                        .with(userJwt("kc-user-a")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED_BY_USER"))
                .andExpect(jsonPath("$.cancelledAt").isNotEmpty());
        org.junit.jupiter.api.Assertions.assertEquals(1, this.registrationRepository.count());
        OutboxEvent accessCancellation = this.outboxRepository
                .findByAggregateIdOrderByCreatedAtAsc(registration.getId()).stream()
                .filter(message -> "RegistrationCancelled".equals(message.getEventType())).findFirst().orElseThrow();
        JsonNode accessCancellationPayload = this.objectMapper.readTree(accessCancellation.getPayloadJson());
        org.junit.jupiter.api.Assertions.assertEquals(registration.getId().toString(),
                accessCancellationPayload.get("registrationId").asText());
        org.junit.jupiter.api.Assertions.assertEquals(event.getId().toString(),
                accessCancellationPayload.get("eventId").asText());
        org.junit.jupiter.api.Assertions.assertEquals("kc-user-a", accessCancellationPayload.get("userId").asText());

        this.mockMvc
                .perform(delete("/api/v1/registrations/{registrationId}", registration.getId())
                        .with(userJwt("kc-user-a")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("REGISTRATION_NOT_ACTIVE"));

        Event soon = futureFreeEvent(2, Duration.ofHours(23));
        this.eventRepository.saveAndFlush(soon);
        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", soon.getId()).with(userJwt("kc-user-b")))
                .andExpect(status().isCreated());
        Registration soonRegistration = this.registrationRepository
                .findByUserIdOrderByRegisteredAtDesc("kc-user-b", org.springframework.data.domain.PageRequest.of(0, 1))
                .getContent().getFirst();
        this.mockMvc
                .perform(delete("/api/v1/registrations/{registrationId}", soonRegistration.getId())
                        .with(userJwt("kc-user-b")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("CANCELLATION_WINDOW_CLOSED"));
    }

    @Test
    void requiresUserRoleAndRejectsCancelledExpiredOrUnpricedEvents() throws Exception {
        Instant now = Instant.now();
        Event cancelled = futureFreeEvent(2, Duration.ofDays(3));
        Event expired = event(UUID.randomUUID(), "Prazo encerrado", EventStatus.ACTIVE, RegistrationMode.INTERNAL_FREE,
                now.plusSeconds(86_400), now.plusSeconds(90_000), now.minusSeconds(1), null, null);
        Event unpriced = event(UUID.randomUUID(), "Sem preço", EventStatus.ACTIVE, RegistrationMode.INTERNAL_PAID,
                now.plusSeconds(86_400), now.plusSeconds(90_000), now.plusSeconds(43_200), null, null);
        Event noCapacity = futureFreeEvent(2, Duration.ofDays(3));
        cancelled = new Event(cancelled.getId(), cancelled.getTitle(), cancelled.getDescription(),
                cancelled.getOrganizerType(), cancelled.getOrganizerId(), cancelled.getImageUrl(),
                cancelled.getLocation(), cancelled.getStartsAt(), cancelled.getEndsAt(), cancelled.getCategory(),
                cancelled.getCapacity(), cancelled.getRegistrationDeadline(), cancelled.getRegistrationMode(),
                cancelled.getPrice(), cancelled.getExternalUrl(), cancelled.isAttendanceEnabled(),
                cancelled.getAttendanceMode(), EventStatus.CANCELLED, cancelled.getCreatedAt());
        this.eventRepository.saveAllAndFlush(List.of(cancelled, expired, unpriced, noCapacity));

        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", noCapacity.getId()))
                .andExpect(status().isUnauthorized());
        this.mockMvc
                .perform(post("/api/v1/events/{eventId}/registrations", noCapacity.getId())
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_GUEST"))))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", unpriced.getId()).with(userJwt("kc-user")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("EVENT_PRICE_NOT_CONFIGURED"));
        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", cancelled.getId()).with(userJwt("kc-user")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("EVENT_CANCELLED"));
        this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", expired.getId()).with(userJwt("kc-user")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("REGISTRATION_CLOSED"));
        org.junit.jupiter.api.Assertions.assertEquals(0, this.registrationRepository.count());
    }

    @Test
    void authorizedOrganizersCanCreateEditAndCancelEventsFollowingPaidModeRules() throws Exception {
        UUID departmentId = UUID.randomUUID();
        UUID communityId = UUID.randomUUID();
        Instant now = Instant.now();
        String startsAt = now.plus(Duration.ofDays(5)).toString();
        String endsAt = now.plus(Duration.ofDays(5)).plusSeconds(7200).toString();
        String deadline = now.plus(Duration.ofDays(4)).toString();

        when(this.campusOrganizerClient.getContexts("organizer-token")).thenReturn(
                new EventOrganizerContextsResponse(List.of(new EventOrganizerContext("DEPARTMENT", departmentId, "DCC"),
                        new EventOrganizerContext("COMMUNITY", communityId, "Comunidade de Jogos"))));
        when(this.campusOrganizerClient.getContexts("regular-token"))
                .thenReturn(new EventOrganizerContextsResponse(List.of()));

        String departmentInternalPaidBody = """
                {
                  "title": "Workshop de Sistemas Distribuídos",
                  "description": "Laboratório prático com inscrição paga interna via Pix.",
                  "organizerType": "DEPARTMENT",
                  "organizerId": "%s",
                  "location": "Auditório DCC",
                  "startsAt": "%s",
                  "endsAt": "%s",
                  "category": "ACADEMIC",
                  "capacity": 40,
                  "registrationDeadline": "%s",
                  "registrationMode": "INTERNAL_PAID",
                  "price": 2500,
                  "attendanceEnabled": true,
                  "attendanceMode": "PARTICIPANT_SCANS_EVENT"
                }
                """.formatted(departmentId, startsAt, endsAt, deadline);

        String createdResponse = this.mockMvc
                .perform(post("/api/v1/events").with(userJwtWithToken("organizer-user", "organizer-token"))
                        .contentType(MediaType.APPLICATION_JSON).content(departmentInternalPaidBody))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.organizerType").value("DEPARTMENT"))
                .andExpect(jsonPath("$.createdByUserId").value("organizer-user"))
                .andExpect(jsonPath("$.registrationMode").value("INTERNAL_PAID"))
                .andExpect(jsonPath("$.price").value(2500)).andReturn().getResponse().getContentAsString();
        UUID departmentEventId = UUID.fromString(this.objectMapper.readTree(createdResponse).get("id").asText());
        this.assertProjectionSnapshot(departmentEventId, EventProjectionEvents.CREATED, 0, "ACTIVE");

        String departmentInvalidExternalBody = departmentInternalPaidBody
                .replace("\"INTERNAL_PAID\"", "\"EXTERNAL_PAID\"")
                .replace("\"price\": 2500", "\"price\": 2500, \"externalUrl\": \"https://example.org/ext\"");
        this.mockMvc
                .perform(post("/api/v1/events").with(userJwtWithToken("organizer-user", "organizer-token"))
                        .contentType(MediaType.APPLICATION_JSON).content(departmentInvalidExternalBody))
                .andExpect(status().isBadRequest());

        String communityInvalidInternalPaidBody = departmentInternalPaidBody.replace("\"DEPARTMENT\"", "\"COMMUNITY\"")
                .replace(departmentId.toString(), communityId.toString());
        this.mockMvc
                .perform(post("/api/v1/events").with(userJwtWithToken("organizer-user", "organizer-token"))
                        .contentType(MediaType.APPLICATION_JSON).content(communityInvalidInternalPaidBody))
                .andExpect(status().isBadRequest());

        String communityExternalPaidBody = """
                {
                  "title": "Torneio Cultural da Comunidade",
                  "description": "Inscrição paga em link externo da comunidade.",
                  "organizerType": "COMMUNITY",
                  "organizerId": "%s",
                  "location": "Centro de Convivência",
                  "startsAt": "%s",
                  "endsAt": "%s",
                  "category": "CULTURE",
                  "capacity": 100,
                  "registrationDeadline": "%s",
                  "registrationMode": "EXTERNAL_PAID",
                  "price": 1500,
                  "externalUrl": "https://example.org/comunidade/inscricao"
                }
                """.formatted(communityId, startsAt, endsAt, deadline);
        this.mockMvc
                .perform(post("/api/v1/events").with(userJwtWithToken("organizer-user", "organizer-token"))
                        .contentType(MediaType.APPLICATION_JSON).content(communityExternalPaidBody))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.organizerType").value("COMMUNITY"))
                .andExpect(jsonPath("$.registrationMode").value("EXTERNAL_PAID"))
                .andExpect(jsonPath("$.externalUrl").value("https://example.org/comunidade/inscricao"));

        this.mockMvc.perform(get("/api/v1/events/managed").with(userJwtWithToken("organizer-user", "organizer-token")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2));

        this.mockMvc.perform(patch("/api/v1/events/{eventId}", departmentEventId)
                .with(userJwtWithToken("organizer-user", "organizer-token")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Workshop Atualizado\",\"price\":3000}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Workshop Atualizado")).andExpect(jsonPath("$.price").value(3000));
        this.assertProjectionSnapshot(departmentEventId, EventProjectionEvents.UPDATED, 1, "ACTIVE");

        this.mockMvc.perform(patch("/api/v1/events/{eventId}", departmentEventId)
                .with(userJwtWithToken("regular-user", "regular-token")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Hack\"}")).andExpect(status().isForbidden());

        this.mockMvc
                .perform(delete("/api/v1/events/{eventId}", departmentEventId)
                        .with(userJwtWithToken("organizer-user", "organizer-token")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        this.assertProjectionSnapshot(departmentEventId, EventProjectionEvents.CANCELLED, 2, "CANCELLED");
    }

    private static Event event(UUID id, String title, EventStatus status, RegistrationMode registrationMode,
            Instant startsAt, Instant endsAt, Instant registrationDeadline, Long price, String externalUrl) {
        return new Event(id, title, "Descrição do evento persistido.", "UNIVERSITY", UUID.randomUUID(), null,
                "Auditório Central", startsAt, endsAt, "ACADEMIC", 120, registrationDeadline, registrationMode, price,
                externalUrl, true, AttendanceMode.PARTICIPANT_SCANS_EVENT, status,
                Instant.parse("2027-01-01T12:00:00Z"));
    }

    private void assertProjectionSnapshot(UUID eventId, String eventType, long version, String status)
            throws Exception {
        OutboxEvent outboxEvent = this.outboxRepository.findByAggregateIdOrderByCreatedAtAsc(eventId).stream()
                .filter(candidate -> eventType.equals(candidate.getEventType())).findFirst().orElseThrow();
        JsonNode payload = this.objectMapper.readTree(outboxEvent.getPayloadJson());
        org.junit.jupiter.api.Assertions.assertEquals(version, payload.get("aggregateVersion").asLong());
        org.junit.jupiter.api.Assertions.assertEquals(status, payload.get("status").asText());
    }

    private Event futureFreeEvent(int capacity, Duration startsIn) {
        Instant now = Instant.now();
        Instant startsAt = now.plus(startsIn);
        return new Event(UUID.randomUUID(), "Evento gratuito", "Descrição do evento persistido.", "UNIVERSITY",
                UUID.randomUUID(), null, "Auditório Central", startsAt, startsAt.plusSeconds(3600), "ACADEMIC",
                capacity, now.plus(startsIn).minusSeconds(60), RegistrationMode.INTERNAL_FREE, null, null, true,
                AttendanceMode.PARTICIPANT_SCANS_EVENT, EventStatus.ACTIVE, now, "keycloak-event-creator");
    }

    private Event futurePaidEvent(int capacity, Duration startsIn, long amountMinor) {
        Instant now = Instant.now();
        Instant startsAt = now.plus(startsIn);
        return new Event(UUID.randomUUID(), "Evento pago", "Descrição do evento persistido.", "UNIVERSITY",
                UUID.randomUUID(), null, "Auditório Central", startsAt, startsAt.plusSeconds(3600), "ACADEMIC",
                capacity, startsAt.minusSeconds(60), RegistrationMode.INTERNAL_PAID, amountMinor, null, true,
                AttendanceMode.PARTICIPANT_SCANS_EVENT, EventStatus.ACTIVE, now);
    }

    private byte[] paymentConfirmedMessage(Registration registration, Event event, UUID chargeId, UUID messageId,
            Instant paidAt, Instant occurredAt) throws Exception {
        PaymentConfirmedPayload payload = new PaymentConfirmedPayload(chargeId, registration.getId(), event.getId(),
                registration.getUserId(), 2500, PaymentConfirmedPayload.CURRENCY, paidAt);
        IntegrationEventEnvelope envelope = new IntegrationEventEnvelope(messageId, PaymentConfirmedPayload.EVENT_TYPE,
                "Charge", chargeId, occurredAt, 1, this.objectMapper.valueToTree(payload));
        return this.objectMapper.writeValueAsBytes(envelope);
    }

    private byte[] refundFailedMessage(UUID chargeId, UUID registrationId, UUID requestMessageId, UUID messageId,
            Instant occurredAt) throws Exception {
        RefundFailedPayload payload = new RefundFailedPayload(chargeId, registrationId, requestMessageId,
                "PROVIDER_ERROR", occurredAt);
        IntegrationEventEnvelope envelope = new IntegrationEventEnvelope(messageId, RefundFailedPayload.EVENT_TYPE,
                "Charge", chargeId, occurredAt, 1, this.objectMapper.valueToTree(payload));
        return this.objectMapper.writeValueAsBytes(envelope);
    }

    private byte[] refundSucceededMessage(UUID chargeId, UUID registrationId, UUID requestMessageId, UUID messageId,
            long amountMinor, Instant refundedAt) throws Exception {
        RefundSucceededPayload payload = new RefundSucceededPayload(chargeId, registrationId, requestMessageId,
                amountMinor, RefundSucceededPayload.CURRENCY, refundedAt);
        IntegrationEventEnvelope envelope = new IntegrationEventEnvelope(messageId, RefundSucceededPayload.EVENT_TYPE,
                "Charge", chargeId, refundedAt, 1, this.objectMapper.valueToTree(payload));
        return this.objectMapper.writeValueAsBytes(envelope);
    }

    private int registerConcurrently(UUID eventId, String subject, CountDownLatch ready, CountDownLatch start)
            throws Exception {
        ready.countDown();
        org.junit.jupiter.api.Assertions.assertTrue(start.await(10, TimeUnit.SECONDS));
        return this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", eventId).with(userJwt(subject)))
                .andReturn().getResponse().getStatus();
    }

    private static RequestPostProcessor userJwt() {
        return userJwt("keycloak-subject");
    }

    private static RequestPostProcessor userJwt(String subject) {
        return jwt().jwt(token -> token.subject(subject)).authorities(new SimpleGrantedAuthority("ROLE_USER"));
    }

    private static RequestPostProcessor userJwtWithToken(String subject, String tokenValue) {
        return jwt().jwt(token -> token.subject(subject).tokenValue(tokenValue))
                .authorities(new SimpleGrantedAuthority("ROLE_USER"));
    }
}

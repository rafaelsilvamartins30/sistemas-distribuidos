package br.unir.engagement;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.entity.Registration;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.entity.RegistrationStatus;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.repository.OutboxRepository;
import br.unir.engagement.repository.RegistrationRepository;
import br.unir.engagement.service.RegistrationExpirationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
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
import org.springframework.security.core.authority.SimpleGrantedAuthority;
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
    private ObjectMapper objectMapper;

    @BeforeEach
    void clearEvents() {
        this.outboxRepository.deleteAllInBatch();
        this.registrationRepository.deleteAllInBatch();
        this.eventRepository.deleteAllInBatch();
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

    private static Event event(UUID id, String title, EventStatus status, RegistrationMode registrationMode,
            Instant startsAt, Instant endsAt, Instant registrationDeadline, Long price, String externalUrl) {
        return new Event(id, title, "Descrição do evento persistido.", "UNIVERSITY", UUID.randomUUID(), null,
                "Auditório Central", startsAt, endsAt, "ACADEMIC", 120, registrationDeadline, registrationMode, price,
                externalUrl, true, AttendanceMode.PARTICIPANT_SCANS_EVENT, status,
                Instant.parse("2027-01-01T12:00:00Z"));
    }

    private Event futureFreeEvent(int capacity, Duration startsIn) {
        Instant now = Instant.now();
        Instant startsAt = now.plus(startsIn);
        return new Event(UUID.randomUUID(), "Evento gratuito", "Descrição do evento persistido.", "UNIVERSITY",
                UUID.randomUUID(), null, "Auditório Central", startsAt, startsAt.plusSeconds(3600), "ACADEMIC",
                capacity, now.plus(startsIn).minusSeconds(60), RegistrationMode.INTERNAL_FREE, null, null, true,
                AttendanceMode.PARTICIPANT_SCANS_EVENT, EventStatus.ACTIVE, now);
    }

    private Event futurePaidEvent(int capacity, Duration startsIn, long amountMinor) {
        Instant now = Instant.now();
        Instant startsAt = now.plus(startsIn);
        return new Event(UUID.randomUUID(), "Evento pago", "Descrição do evento persistido.", "UNIVERSITY",
                UUID.randomUUID(), null, "Auditório Central", startsAt, startsAt.plusSeconds(3600), "ACADEMIC",
                capacity, startsAt.minusSeconds(60), RegistrationMode.INTERNAL_PAID, amountMinor, null, true,
                AttendanceMode.PARTICIPANT_SCANS_EVENT, EventStatus.ACTIVE, now);
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
}

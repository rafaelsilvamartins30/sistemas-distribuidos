package br.unir.engagement.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.unir.engagement.dto.IntegrationEventEnvelope;
import br.unir.engagement.dto.PaymentConfirmedPayload;
import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.Registration;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.entity.RegistrationStatus;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.repository.RegistrationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class PaymentConfirmationServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-16T15:05:00Z");

    @Mock
    private EventRepository eventRepository;

    @Mock
    private RegistrationRepository registrationRepository;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    private PaymentConfirmationService service;

    @BeforeEach
    void setUp() {
        this.service = new PaymentConfirmationService(this.eventRepository, this.registrationRepository,
                this.jdbcTemplate, this.objectMapper, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void compensatesLateSportsPaymentWithDomainReason() throws Exception {
        UUID registrationId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        UUID chargeId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        Instant paidAt = NOW.minusSeconds(30);
        SportsParticipationService sportsParticipationService = org.mockito.Mockito
                .mock(SportsParticipationService.class);
        this.service = new PaymentConfirmationService(this.eventRepository, this.registrationRepository,
                this.jdbcTemplate, this.objectMapper, Clock.fixed(NOW, ZoneOffset.UTC), sportsParticipationService);
        when(this.registrationRepository.findEventIdById(registrationId)).thenReturn(Optional.empty());
        when(sportsParticipationService.confirmSportsPayment(registrationId, eventId, "keycloak-sub", 2500, paidAt))
                .thenReturn("PAYMENT_AFTER_DEADLINE");
        when(this.jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        byte[] body = message(messageId, chargeId, registrationId, eventId, "keycloak-sub", paidAt, NOW);

        this.service.consume(body);

        verify(sportsParticipationService).confirmSportsPayment(registrationId, eventId, "keycloak-sub", 2500, paidAt);
        org.mockito.ArgumentCaptor<String> sql = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(this.jdbcTemplate, times(3)).update(sql.capture(), any(Object[].class));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getAllValues().get(1).contains("payment_compensation_cases"));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getAllValues().get(2).contains("outbox_events"));
    }

    @Test
    void acceptsPaymentAtDeadlineWhenProcessedImmediatelyBeforeReservationExpiry() throws Exception {
        UUID registrationId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        UUID chargeId = UUID.randomUUID();
        Instant paymentDeadline = NOW.minusSeconds(60);
        Instant reservationExpires = NOW.plusNanos(1);
        Registration registration = registration(registrationId, eventId, "keycloak-sub",
                RegistrationStatus.PENDING_PAYMENT, paymentDeadline, reservationExpires);
        Event event = event(eventId, RegistrationMode.INTERNAL_PAID, EventStatus.ACTIVE);
        this.stubRegistration(event, registration);
        when(this.jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        byte[] body = message(chargeId, registrationId, eventId, "keycloak-sub", paymentDeadline, NOW);

        this.service.consume(body);

        assertEquals(RegistrationStatus.CONFIRMED, registration.getStatus());
        assertEquals(paymentDeadline, registration.getConfirmedAt());
        InOrder lockOrder = inOrder(this.eventRepository, this.registrationRepository);
        lockOrder.verify(this.eventRepository).findByIdForUpdate(eventId);
        lockOrder.verify(this.registrationRepository).findByIdForUpdate(registrationId);
        verify(this.registrationRepository).saveAndFlush(registration);
        org.mockito.ArgumentCaptor<String> sql = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(this.jdbcTemplate, times(2)).update(sql.capture(), any(Object[].class));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getAllValues().get(1).contains("outbox_events"));
    }

    @Test
    void recordsCompensationWithoutConfirmingPaymentAfterTenMinuteDeadline() throws Exception {
        UUID registrationId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        UUID chargeId = UUID.randomUUID();
        Instant paymentDeadline = NOW.minusSeconds(60);
        Registration registration = registration(registrationId, eventId, "keycloak-sub",
                RegistrationStatus.PENDING_PAYMENT, paymentDeadline, NOW.plusSeconds(60));
        this.stubRegistration(event(eventId, RegistrationMode.INTERNAL_PAID, EventStatus.ACTIVE), registration);
        when(this.jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        byte[] body = message(chargeId, registrationId, eventId, "keycloak-sub", paymentDeadline.plusMillis(1), NOW);

        this.service.consume(body);

        assertEquals(RegistrationStatus.PENDING_PAYMENT, registration.getStatus());
        verify(this.registrationRepository, times(0)).saveAndFlush(registration);
        org.mockito.ArgumentCaptor<String> sql = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(this.jdbcTemplate, times(3)).update(sql.capture(), any(Object[].class));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getAllValues().get(1).contains("payment_compensation_cases"));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getAllValues().get(2).contains("outbox_events"));
    }

    @Test
    void recordsCompensationForPaymentBeforeRegistration() throws Exception {
        UUID registrationId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        UUID chargeId = UUID.randomUUID();
        Instant paymentDeadline = NOW.plusSeconds(60);
        Registration registration = registration(registrationId, eventId, "keycloak-sub",
                RegistrationStatus.PENDING_PAYMENT, paymentDeadline, NOW.plusSeconds(120));
        this.stubRegistration(event(eventId, RegistrationMode.INTERNAL_PAID, EventStatus.ACTIVE), registration);
        when(this.jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        this.service.consume(message(chargeId, registrationId, eventId, "keycloak-sub", NOW.minusSeconds(601), NOW));

        assertEquals(RegistrationStatus.PENDING_PAYMENT, registration.getStatus());
        verify(this.registrationRepository, times(0)).saveAndFlush(registration);
        org.mockito.ArgumentCaptor<String> sql = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(this.jdbcTemplate, times(3)).update(sql.capture(), any(Object[].class));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getAllValues().get(1).contains("payment_compensation_cases"));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getAllValues().get(2).contains("outbox_events"));
    }

    @Test
    void expiresReservationAndRecordsCompensationWhenConfirmationIsProcessedAtFifteenMinuteBoundary() throws Exception {
        UUID registrationId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        UUID chargeId = UUID.randomUUID();
        Instant paymentDeadline = NOW.minusSeconds(300);
        Registration registration = registration(registrationId, eventId, "keycloak-sub",
                RegistrationStatus.PENDING_PAYMENT, paymentDeadline, NOW);
        this.stubRegistration(event(eventId, RegistrationMode.INTERNAL_PAID, EventStatus.ACTIVE), registration);
        when(this.jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        byte[] body = message(chargeId, registrationId, eventId, "keycloak-sub", paymentDeadline, NOW);

        this.service.consume(body);

        assertEquals(RegistrationStatus.PAYMENT_EXPIRED, registration.getStatus());
        verify(this.registrationRepository).saveAndFlush(registration);
        org.mockito.ArgumentCaptor<String> sql = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(this.jdbcTemplate, times(3)).update(sql.capture(), any(Object[].class));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getAllValues().get(1).contains("payment_compensation_cases"));
        org.junit.jupiter.api.Assertions.assertTrue(sql.getAllValues().get(2).contains("outbox_events"));
    }

    @Test
    void terminalCancellationIsNotReactivatedByPaymentConfirmation() throws Exception {
        UUID registrationId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        UUID chargeId = UUID.randomUUID();
        Registration registration = registration(registrationId, eventId, "keycloak-sub",
                RegistrationStatus.CANCELLED_BY_USER, NOW.minusSeconds(60), NOW.plusSeconds(60));
        this.stubRegistration(event(eventId, RegistrationMode.INTERNAL_PAID, EventStatus.ACTIVE), registration);
        when(this.jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        this.service.consume(message(chargeId, registrationId, eventId, "keycloak-sub", NOW.minusSeconds(30), NOW));

        assertEquals(RegistrationStatus.CANCELLED_BY_USER, registration.getStatus());
        verify(this.registrationRepository, times(0)).saveAndFlush(registration);
        verify(this.jdbcTemplate, times(3)).update(anyString(), any(Object[].class));
    }

    private void stubRegistration(Event event, Registration registration) {
        when(this.registrationRepository.findEventIdById(registration.getId())).thenReturn(Optional.of(event.getId()));
        when(this.eventRepository.findByIdForUpdate(event.getId())).thenReturn(Optional.of(event));
        when(this.registrationRepository.findByIdForUpdate(registration.getId())).thenReturn(Optional.of(registration));
    }

    private byte[] message(UUID chargeId, UUID registrationId, UUID eventId, String userId, Instant paidAt,
            Instant occurredAt) throws Exception {
        return message(UUID.randomUUID(), chargeId, registrationId, eventId, userId, paidAt, occurredAt);
    }

    private byte[] message(UUID messageId, UUID chargeId, UUID registrationId, UUID eventId, String userId,
            Instant paidAt, Instant occurredAt) throws Exception {
        PaymentConfirmedPayload payload = new PaymentConfirmedPayload(chargeId, registrationId, eventId, userId, 2500,
                "BRL", paidAt);
        IntegrationEventEnvelope envelope = new IntegrationEventEnvelope(messageId, PaymentConfirmedPayload.EVENT_TYPE,
                "Charge", chargeId, occurredAt, 1, this.objectMapper.valueToTree(payload));
        return this.objectMapper.writeValueAsBytes(envelope);
    }

    private static Event event(UUID eventId, RegistrationMode mode, EventStatus status) {
        return new Event(eventId, "Evento", "Descrição", "UNIVERSITY", UUID.randomUUID(), null, "Auditório",
                NOW.plusSeconds(3600), NOW.plusSeconds(7200), "ACADEMIC", 10, NOW.plusSeconds(1800), mode, 2500L, null,
                true, AttendanceMode.PARTICIPANT_SCANS_EVENT, status, NOW.minusSeconds(600));
    }

    private static Registration registration(UUID registrationId, UUID eventId, String userId,
            RegistrationStatus status, Instant paymentDeadlineAt, Instant reservationExpiresAt) {
        return new Registration(registrationId, eventId, userId, status, NOW.minusSeconds(600), null, null,
                paymentDeadlineAt, reservationExpiresAt);
    }
}

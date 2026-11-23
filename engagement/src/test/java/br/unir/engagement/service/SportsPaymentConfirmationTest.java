package br.unir.engagement.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.unir.engagement.client.CampusEventOrganizerClient;
import br.unir.engagement.entity.SportsTeam;
import br.unir.engagement.repository.CompetitionRepository;
import br.unir.engagement.repository.OutboxRepository;
import br.unir.engagement.repository.SeasonRepository;
import br.unir.engagement.repository.SportRepository;
import br.unir.engagement.repository.SportsFreeAgentRepository;
import br.unir.engagement.repository.SportsMatchCheckInRepository;
import br.unir.engagement.repository.SportsMatchRepository;
import br.unir.engagement.repository.SportsTeamMemberRepository;
import br.unir.engagement.repository.SportsTeamRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SportsPaymentConfirmationTest {

    private static final Instant NOW = Instant.parse("2026-11-21T15:00:00Z");
    private static final String USER_ID = "keycloak-user";
    private static final long AMOUNT_MINOR = 2500;

    private final SportsTeamRepository teamRepository = mock(SportsTeamRepository.class);
    private SportsParticipationService service;

    @BeforeEach
    void setUp() {
        this.service = new SportsParticipationService(mock(SportRepository.class), mock(CompetitionRepository.class),
                mock(SeasonRepository.class), this.teamRepository, mock(SportsTeamMemberRepository.class),
                mock(SportsFreeAgentRepository.class), mock(SportsMatchRepository.class),
                mock(SportsMatchCheckInRepository.class), mock(CampusEventOrganizerClient.class),
                mock(OutboxRepository.class), new ObjectMapper().findAndRegisterModules(),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void confirmsSportsPaymentAtInclusiveDeadlineWhileReservationIsStillActive() {
        UUID contextId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        Instant createdAt = NOW.minusSeconds(15 * 60L);
        SportsTeam team = pendingTeam(teamId, contextId, createdAt, NOW, NOW.plusSeconds(300));
        when(this.teamRepository.findById(teamId)).thenReturn(Optional.of(team));

        String reason = this.service.confirmSportsPayment(teamId, contextId, USER_ID, AMOUNT_MINOR, NOW);

        assertNull(reason);
        assertEquals("CONFIRMED", team.getStatus());
        verify(this.teamRepository).saveAndFlush(team);
    }

    @Test
    void compensatesAndReleasesTeamReservationForPaymentAfterDeadline() {
        UUID contextId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        Instant createdAt = NOW.minusSeconds(15 * 60L);
        SportsTeam team = pendingTeam(teamId, contextId, createdAt, NOW, NOW.plusSeconds(300));
        when(this.teamRepository.findById(teamId)).thenReturn(Optional.of(team));

        String reason = this.service.confirmSportsPayment(teamId, contextId, USER_ID, AMOUNT_MINOR, NOW.plusMillis(1));

        assertEquals("PAYMENT_AFTER_DEADLINE", reason);
        assertEquals("CANCELLED", team.getStatus());
        verify(this.teamRepository).saveAndFlush(team);
    }

    @Test
    void compensatesAndReleasesTeamReservationAfterReservationExpiry() {
        UUID contextId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        Instant createdAt = NOW.minusSeconds(25 * 60L);
        Instant paymentDeadlineAt = createdAt.plusSeconds(15 * 60L);
        SportsTeam team = pendingTeam(teamId, contextId, createdAt, paymentDeadlineAt, NOW);
        when(this.teamRepository.findById(teamId)).thenReturn(Optional.of(team));

        String reason = this.service.confirmSportsPayment(teamId, contextId, USER_ID, AMOUNT_MINOR, paymentDeadlineAt);

        assertEquals("RESERVATION_EXPIRED", reason);
        assertEquals("CANCELLED", team.getStatus());
        verify(this.teamRepository).saveAndFlush(team);
    }

    @Test
    void rejectsPaymentForAnotherEventOrAmountWithoutCancellingEnrollment() {
        UUID contextId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        Instant createdAt = NOW.minusSeconds(60);
        SportsTeam team = pendingTeam(teamId, contextId, createdAt, NOW.plusSeconds(60), NOW.plusSeconds(120));
        when(this.teamRepository.findById(teamId)).thenReturn(Optional.of(team));

        String eventReason = this.service.confirmSportsPayment(teamId, UUID.randomUUID(), USER_ID, AMOUNT_MINOR, NOW);
        String amountReason = this.service.confirmSportsPayment(teamId, contextId, USER_ID, AMOUNT_MINOR + 1, NOW);

        assertEquals("EVENT_ID_MISMATCH", eventReason);
        assertEquals("AMOUNT_MISMATCH", amountReason);
        assertEquals("PENDING_PAYMENT", team.getStatus());
    }

    private static SportsTeam pendingTeam(UUID id, UUID contextId, Instant createdAt, Instant paymentDeadlineAt,
            Instant reservationExpiresAt) {
        return new SportsTeam(id, "COMPETITION", contextId, "Equipe teste", USER_ID, "PENDING_PAYMENT", createdAt,
                AMOUNT_MINOR, paymentDeadlineAt, reservationExpiresAt);
    }
}

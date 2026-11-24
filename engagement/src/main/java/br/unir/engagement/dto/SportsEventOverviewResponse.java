package br.unir.engagement.dto;

import br.unir.engagement.dto.SportsStandingsResponse.Table;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SportsEventOverviewResponse(String contextType, UUID contextId, String title, String skillLevel,
        String organizerType, UUID organizerId, int targetTeamCount, int rosterMin, int rosterMax, long teamEntryPrice,
        long freeAgentPrice, Instant registrationDeadline, String formatOrMode, String status, SportResponse sport,
        List<SportsTeamResponse> teams, List<SportsFreeAgentResponse> freeAgents, List<SportsMatchResponse> matches,
        List<Table> standings, List<KnockoutTie> knockoutTies, boolean canGenerateMatches, String phase,
        UUID championTeamId, List<UUID> manualChampionCandidates, boolean viewerCanManage, UUID viewerTeamId,
        boolean viewerFreeAgentQueued, boolean viewerPendingPayment, boolean viewerCanEnroll) {

    public record KnockoutTie(int round, UUID firstMatchId, UUID secondMatchId, int homeAggregate, int awayAggregate,
            UUID winnerTeamId) {
    }

    public SportsEventOverviewResponse {
        teams = teams == null ? List.of() : List.copyOf(teams);
        freeAgents = freeAgents == null ? List.of() : List.copyOf(freeAgents);
        matches = matches == null ? List.of() : List.copyOf(matches);
        standings = standings == null ? List.of() : List.copyOf(standings);
        knockoutTies = knockoutTies == null ? List.of() : List.copyOf(knockoutTies);
        manualChampionCandidates = manualChampionCandidates == null ? List.of() : List.copyOf(manualChampionCandidates);
    }
}

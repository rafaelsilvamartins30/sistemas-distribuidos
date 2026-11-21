package br.unir.engagement.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SportsEventOverviewResponse(String contextType, UUID contextId, String title, String skillLevel,
        String organizerType, UUID organizerId, int targetTeamCount, int rosterMin, int rosterMax, long teamEntryPrice,
        long freeAgentPrice, Instant registrationDeadline, String formatOrMode, List<String> tieBreakers, String status,
        SportResponse sport, List<SportsTeamResponse> teams, List<SportsFreeAgentResponse> freeAgents,
        List<SportsMatchResponse> matches, boolean viewerCanManage, UUID viewerTeamId, boolean viewerFreeAgentQueued,
        boolean viewerPendingPayment) {

    public SportsEventOverviewResponse {
        tieBreakers = tieBreakers == null ? List.of() : List.copyOf(tieBreakers);
        teams = teams == null ? List.of() : List.copyOf(teams);
        freeAgents = freeAgents == null ? List.of() : List.copyOf(freeAgents);
        matches = matches == null ? List.of() : List.copyOf(matches);
    }
}

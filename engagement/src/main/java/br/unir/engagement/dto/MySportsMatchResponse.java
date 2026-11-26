package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

public record MySportsMatchResponse(UUID matchId, String contextType, UUID contextId, String eventTitle,
        String sportName, int roundNumber, UUID teamId, String teamName, String opponentName, Instant scheduledAt,
        Instant checkInOpensAt, Instant checkInClosesAt, String location, Integer homeScore, Integer awayScore,
        String status, boolean hasCheckinToken, boolean viewerCheckedIn) {
}

package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

public record SportsMatchResponse(UUID id, int roundNumber, UUID homeTeamId, String homeTeamName, UUID awayTeamId,
        String awayTeamName, Instant scheduledAt, String location, Integer homeScore, Integer awayScore, String status,
        int checkinCount, boolean viewerCheckedIn, boolean hasCheckinToken, String checkinToken) {
}

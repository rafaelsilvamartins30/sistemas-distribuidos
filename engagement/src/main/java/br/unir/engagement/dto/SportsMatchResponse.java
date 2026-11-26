package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

public record SportsMatchResponse(UUID id, int roundNumber, String roundLabel, UUID homeTeamId, String homeTeamName,
        UUID awayTeamId, String awayTeamName, Instant scheduledAt, Instant checkInOpensAt, Instant checkInClosesAt,
        String location, Integer homeScore, Integer awayScore, Integer homePenaltyScore, Integer awayPenaltyScore,
        String status, int checkinCount, boolean viewerCheckedIn, boolean hasCheckinToken, String checkinToken,
        boolean viewerCanCheckIn, boolean viewerCanEditScore, boolean viewerCanManageQr,
        boolean viewerCanReviewAttendance) {
}

package br.unir.engagement.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CreateSeasonRequest(String title, UUID sportId, String skillLevel, String organizerType, UUID organizerId,
        Integer targetTeamCount, Integer rosterMin, Integer rosterMax, List<String> tieBreakers, Long teamEntryPrice,
        Long freeAgentPrice, Instant registrationDeadline) {

    public CreateSeasonRequest {
        tieBreakers = tieBreakers == null ? List.of() : List.copyOf(tieBreakers);
    }
}

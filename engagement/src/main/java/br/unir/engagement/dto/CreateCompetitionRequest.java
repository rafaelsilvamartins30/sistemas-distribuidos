package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

public record CreateCompetitionRequest(String title, UUID sportId, String skillLevel, String organizerType,
        UUID organizerId, Integer targetTeamCount, Integer rosterMin, Integer rosterMax, Long teamEntryPrice,
        Long freeAgentPrice, Instant registrationDeadline) {

}

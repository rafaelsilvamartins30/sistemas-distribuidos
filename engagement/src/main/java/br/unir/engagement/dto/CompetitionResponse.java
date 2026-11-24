package br.unir.engagement.dto;

import br.unir.engagement.entity.Competition;
import java.time.Instant;
import java.util.UUID;

public record CompetitionResponse(UUID id, String title, UUID sportId, String sportName, String skillLevel,
        String organizerType, UUID organizerId, int targetTeamCount, int rosterMin, int rosterMax, long teamEntryPrice,
        long freeAgentPrice, Instant registrationDeadline, String status, String format) {

    public static CompetitionResponse from(Competition competition) {
        return new CompetitionResponse(competition.getId(), competition.getTitle(), competition.getSport().getId(),
                competition.getSport().getName(), competition.getSkillLevel(), competition.getOrganizerType(),
                competition.getOrganizerId(), competition.getTargetTeamCount(), competition.getRosterMin(),
                competition.getRosterMax(), competition.getTeamEntryPrice(), competition.getFreeAgentPrice(),
                competition.getRegistrationDeadline(), competition.getStatus(), competition.getFormat());
    }
}

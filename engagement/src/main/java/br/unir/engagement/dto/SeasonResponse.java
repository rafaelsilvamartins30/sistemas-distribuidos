package br.unir.engagement.dto;

import br.unir.engagement.entity.Season;
import java.time.Instant;
import java.util.UUID;

public record SeasonResponse(UUID id, String title, UUID sportId, String sportName, String skillLevel,
        String organizerType, UUID organizerId, int targetTeamCount, int rosterMin, int rosterMax, String[] tieBreakers,
        long teamEntryPrice, long freeAgentPrice, Instant registrationDeadline, String status, String roundRobinMode) {

    public static SeasonResponse from(Season season) {
        return new SeasonResponse(season.getId(), season.getTitle(), season.getSport().getId(),
                season.getSport().getName(), season.getSkillLevel(), season.getOrganizerType(), season.getOrganizerId(),
                season.getTargetTeamCount(), season.getRosterMin(), season.getRosterMax(), season.getTieBreakers(),
                season.getTeamEntryPrice(), season.getFreeAgentPrice(), season.getRegistrationDeadline(),
                season.getStatus(), season.getRoundRobinMode());
    }
}

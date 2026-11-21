package br.unir.engagement.dto;

import br.unir.engagement.entity.SportsFreeAgent;
import java.time.Instant;
import java.util.UUID;

public record SportsFreeAgentResponse(UUID id, String userId, String displayName, UUID allocatedTeamId, String status,
        Instant registeredAt) {

    public static SportsFreeAgentResponse from(SportsFreeAgent freeAgent) {
        return new SportsFreeAgentResponse(freeAgent.getId(), freeAgent.getUserId(), freeAgent.getDisplayName(),
                freeAgent.getAllocatedTeamId(), freeAgent.getStatus(), freeAgent.getRegisteredAt());
    }
}

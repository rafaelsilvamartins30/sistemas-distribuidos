package br.unir.engagement.dto;

import br.unir.engagement.entity.SportsTeam;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SportsTeamResponse(UUID id, String name, String captainUserId, String status, Instant createdAt,
        List<SportsTeamMemberResponse> members) {

    public SportsTeamResponse {
        members = members == null ? List.of() : List.copyOf(members);
    }

    public static SportsTeamResponse from(SportsTeam team, List<SportsTeamMemberResponse> members) {
        return new SportsTeamResponse(team.getId(), team.getName(), team.getCaptainUserId(), team.getStatus(),
                team.getCreatedAt(), members);
    }
}

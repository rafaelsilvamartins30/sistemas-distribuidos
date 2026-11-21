package br.unir.engagement.dto;

import br.unir.engagement.entity.SportsTeamMember;
import java.time.Instant;
import java.util.UUID;

public record SportsTeamMemberResponse(UUID id, String userId, String displayName, String role, Instant joinedAt) {

    public static SportsTeamMemberResponse from(SportsTeamMember member) {
        return new SportsTeamMemberResponse(member.getId(), member.getUserId(), member.getDisplayName(),
                member.getRole(), member.getJoinedAt());
    }
}

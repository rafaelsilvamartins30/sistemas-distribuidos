package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

public record SportsMatchCheckInResponse(UUID id, UUID matchId, UUID teamId, String userId, Instant checkedInAt) {
}

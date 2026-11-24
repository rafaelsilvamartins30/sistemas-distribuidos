package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

public record UpdateSportsEventRequest(Instant registrationDeadline, UUID championTeamId) {
}

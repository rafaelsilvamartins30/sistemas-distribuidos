package br.unir.engagement.dto;

import java.time.Instant;

public record UpdateSportsEventRequest(Instant registrationDeadline) {
}

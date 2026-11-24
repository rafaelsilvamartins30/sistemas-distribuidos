package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

public record MySportsEnrollmentResponse(String contextType, UUID contextId, String title, String sportName,
        String skillLevel, String enrollmentRole, String teamName, Instant registrationDeadline, Instant firstMatchAt) {
}

package br.unir.engagement.dto;

import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.RegistrationMode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record CreateEventRequest(@NotBlank String title, @NotBlank String description, @NotBlank String organizerType,
        @NotNull UUID organizerId, String imageUrl, @NotBlank String location, @NotNull Instant startsAt,
        @NotNull Instant endsAt, @NotBlank String category, Integer capacity, @NotNull Instant registrationDeadline,
        @NotNull RegistrationMode registrationMode, Long price, String externalUrl, Boolean attendanceEnabled,
        AttendanceMode attendanceMode) {
}

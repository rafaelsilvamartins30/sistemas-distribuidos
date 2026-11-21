package br.unir.engagement.dto;

import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.RegistrationMode;
import java.time.Instant;

public record UpdateEventRequest(String title, String description, String imageUrl, Boolean clearImageUrl,
        String location, Instant startsAt, Instant endsAt, String category, Integer capacity, Boolean clearCapacity,
        Instant registrationDeadline, RegistrationMode registrationMode, Long price, Boolean clearPrice,
        String externalUrl, Boolean clearExternalUrl, Boolean attendanceEnabled, AttendanceMode attendanceMode) {
}

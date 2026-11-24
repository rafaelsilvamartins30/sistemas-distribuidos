package br.unir.engagement.dto;

import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.Registration;
import br.unir.engagement.entity.RegistrationStatus;
import java.time.Instant;
import java.util.UUID;

public record RegistrationResponse(UUID id, UUID eventId, String userId, RegistrationStatus status,
        Instant registeredAt, Instant confirmedAt, Instant cancelledAt, Instant paymentDeadlineAt,
        Instant reservationExpiresAt, EventResponse event, boolean canCancel, String cancellationBlockedReason) {

    public static RegistrationResponse from(Registration registration, Event event, Instant now) {
        String reason = registration.cancellationBlockedReason(event, now);
        return new RegistrationResponse(registration.getId(), registration.getEventId(), registration.getUserId(),
                registration.getStatus(), registration.getRegisteredAt(), registration.getConfirmedAt(),
                registration.getCancelledAt(), registration.getPaymentDeadlineAt(),
                registration.getReservationExpiresAt(), EventResponse.from(event), reason == null, reason);
    }
}

package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

/** Version 1 integration contract sent from Engagement to Payment. */
public record RegistrationPaymentRequestedPayload(UUID registrationId, UUID eventId, String userId, long amountMinor,
        String currency, Instant paymentDeadlineAt, Instant reservationExpiresAt) {

    public static final String EVENT_TYPE = "RegistrationPaymentRequested";
    public static final String ROUTING_KEY = "engagement.registration.payment-requested.v1";
    public static final String CURRENCY = "BRL";
}

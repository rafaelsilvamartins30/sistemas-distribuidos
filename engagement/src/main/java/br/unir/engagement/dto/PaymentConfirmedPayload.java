package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

/** Version 1 payment confirmation consumed from Payment. */
public record PaymentConfirmedPayload(UUID chargeId, UUID registrationId, UUID eventId, String userId, long amountMinor,
        String currency, Instant paidAt) {

    public static final String EVENT_TYPE = "PaymentConfirmed";
    public static final String ROUTING_KEY = "payment.charge.confirmed.v1";
    public static final String CURRENCY = "BRL";
}

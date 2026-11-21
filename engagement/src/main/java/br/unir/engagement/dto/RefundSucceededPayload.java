package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

/** Successful full-refund result from Payment v1. */
public record RefundSucceededPayload(UUID chargeId, UUID registrationId, UUID requestMessageId, long amountMinor,
        String currency, Instant refundedAt) {

    public static final String EVENT_TYPE = "RefundSucceeded";
    public static final String ROUTING_KEY = "payment.refund.succeeded.v1";
    public static final String CURRENCY = "BRL";
}

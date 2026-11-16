package br.unir.engagement.dto;

import java.time.Instant;
import java.util.UUID;

/** Failed refund attempt from Payment v1; a later retry may still succeed. */
public record RefundFailedPayload(UUID chargeId, UUID registrationId, UUID requestMessageId, String failureCode,
        Instant failedAt) {

    public static final String EVENT_TYPE = "RefundFailed";
    public static final String ROUTING_KEY = "payment.refund.failed.v1";
}

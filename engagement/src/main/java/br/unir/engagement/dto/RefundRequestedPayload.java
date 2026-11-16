package br.unir.engagement.dto;

import java.util.UUID;

/** The v1 instruction for Payment to return a captured charge in full. */
public record RefundRequestedPayload(UUID chargeId, UUID registrationId, UUID paymentMessageId, String reason) {

    public static final String EVENT_TYPE = "RefundRequested";
    public static final String ROUTING_KEY = "engagement.payment.refund-requested.v1";
}

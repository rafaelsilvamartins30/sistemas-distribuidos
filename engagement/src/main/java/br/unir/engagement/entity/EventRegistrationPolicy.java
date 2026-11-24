package br.unir.engagement.entity;

import java.time.Instant;

public final class EventRegistrationPolicy {
    public static String blockedReason(EventStatus status, RegistrationMode mode, Instant deadline, Long price,
            Instant now) {
        if (status == EventStatus.CANCELLED) {
            return "EVENT_CANCELLED";
        }
        if (mode == RegistrationMode.EXTERNAL_PAID) {
            return "REGISTRATION_MODE_NOT_SUPPORTED";
        }
        if (!now.isBefore(deadline)) {
            return "REGISTRATION_CLOSED";
        }
        if (mode == RegistrationMode.INTERNAL_PAID && (price == null || price <= 0)) {
            return "EVENT_PRICE_NOT_CONFIGURED";
        }
        return null;
    }

    private EventRegistrationPolicy() {
    }
}

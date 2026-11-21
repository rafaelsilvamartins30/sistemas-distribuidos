package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "registrations")
public class Registration {

    @Id
    private UUID id;

    @Column(name = "event_id", nullable = false, updatable = false)
    private UUID eventId;

    /**
     * Keycloak subject, matching Campus' public UserProfile id/keycloak_user_id
     * contract.
     */
    @Column(name = "user_id", nullable = false, length = 255, updatable = false)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private RegistrationStatus status;

    @Column(name = "registered_at", nullable = false, updatable = false)
    private Instant registeredAt;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "payment_deadline_at")
    private Instant paymentDeadlineAt;

    @Column(name = "reservation_expires_at")
    private Instant reservationExpiresAt;

    protected Registration() {
    }

    public Registration(UUID id, UUID eventId, String userId, RegistrationStatus status, Instant registeredAt,
            Instant confirmedAt, Instant cancelledAt, Instant paymentDeadlineAt, Instant reservationExpiresAt) {
        this.id = id;
        this.eventId = eventId;
        this.userId = userId;
        this.status = status;
        this.registeredAt = registeredAt;
        this.confirmedAt = confirmedAt;
        this.cancelledAt = cancelledAt;
        this.paymentDeadlineAt = paymentDeadlineAt;
        this.reservationExpiresAt = reservationExpiresAt;
    }

    public void cancelByUser(Instant cancelledAt) {
        this.status = RegistrationStatus.CANCELLED_BY_USER;
        this.cancelledAt = cancelledAt;
    }

    public void cancelByEvent(Instant cancelledAt) {
        this.status = RegistrationStatus.CANCELLED_BY_EVENT;
        this.cancelledAt = cancelledAt;
    }

    public void expirePayment() {
        this.status = RegistrationStatus.PAYMENT_EXPIRED;
    }

    public void confirmPayment(Instant paidAt) {
        this.status = RegistrationStatus.CONFIRMED;
        this.confirmedAt = paidAt;
    }

    public UUID getId() {
        return this.id;
    }

    public UUID getEventId() {
        return this.eventId;
    }

    public String getUserId() {
        return this.userId;
    }

    public RegistrationStatus getStatus() {
        return this.status;
    }

    public Instant getRegisteredAt() {
        return this.registeredAt;
    }

    public Instant getConfirmedAt() {
        return this.confirmedAt;
    }

    public Instant getCancelledAt() {
        return this.cancelledAt;
    }

    public Instant getPaymentDeadlineAt() {
        return this.paymentDeadlineAt;
    }

    public Instant getReservationExpiresAt() {
        return this.reservationExpiresAt;
    }
}

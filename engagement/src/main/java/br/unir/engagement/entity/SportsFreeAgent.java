package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sports_free_agents")
public class SportsFreeAgent {

    @Id
    private UUID id;

    @Column(name = "context_type", nullable = false, length = 16)
    private String contextType;

    @Column(name = "context_id", nullable = false)
    private UUID contextId;

    @Column(name = "user_id", nullable = false, length = 128)
    private String userId;

    @Column(name = "display_name", nullable = false, length = 160)
    private String displayName;

    @Column(name = "allocated_team_id")
    private UUID allocatedTeamId;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "registered_at", nullable = false)
    private Instant registeredAt;

    @Column(name = "payment_amount_minor")
    private Long paymentAmountMinor;

    @Column(name = "payment_deadline_at")
    private Instant paymentDeadlineAt;

    @Column(name = "reservation_expires_at")
    private Instant reservationExpiresAt;

    protected SportsFreeAgent() {
    }

    public SportsFreeAgent(UUID id, String contextType, UUID contextId, String userId, String displayName,
            UUID allocatedTeamId, String status, Instant registeredAt) {
        this(id, contextType, contextId, userId, displayName, allocatedTeamId, status, registeredAt, null, null, null);
    }

    public SportsFreeAgent(UUID id, String contextType, UUID contextId, String userId, String displayName,
            UUID allocatedTeamId, String status, Instant registeredAt, Long paymentAmountMinor,
            Instant paymentDeadlineAt, Instant reservationExpiresAt) {
        this.id = id;
        this.contextType = contextType;
        this.contextId = contextId;
        this.userId = userId;
        this.displayName = displayName;
        this.allocatedTeamId = allocatedTeamId;
        this.status = status;
        this.registeredAt = registeredAt;
        this.paymentAmountMinor = paymentAmountMinor;
        this.paymentDeadlineAt = paymentDeadlineAt;
        this.reservationExpiresAt = reservationExpiresAt;
    }

    public UUID getId() {
        return this.id;
    }

    public String getContextType() {
        return this.contextType;
    }

    public UUID getContextId() {
        return this.contextId;
    }

    public String getUserId() {
        return this.userId;
    }

    public String getDisplayName() {
        return this.displayName;
    }

    public UUID getAllocatedTeamId() {
        return this.allocatedTeamId;
    }

    public String getStatus() {
        return this.status;
    }

    public Instant getRegisteredAt() {
        return this.registeredAt;
    }

    public Long getPaymentAmountMinor() {
        return this.paymentAmountMinor;
    }

    public Instant getPaymentDeadlineAt() {
        return this.paymentDeadlineAt;
    }

    public Instant getReservationExpiresAt() {
        return this.reservationExpiresAt;
    }

    public void allocateToTeam(UUID teamId) {
        this.allocatedTeamId = teamId;
        this.status = "ALLOCATED";
    }

    public void markQueued() {
        this.status = "QUEUED";
    }

    public void cancelPayment() {
        if ("PENDING_PAYMENT".equals(this.status)) {
            this.status = "CANCELLED";
        }
    }
}

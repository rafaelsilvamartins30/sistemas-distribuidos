package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sports_teams")
public class SportsTeam {

    @Id
    private UUID id;

    @Column(name = "context_type", nullable = false, length = 16)
    private String contextType;

    @Column(name = "context_id", nullable = false)
    private UUID contextId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "captain_user_id", nullable = false, length = 128)
    private String captainUserId;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "payment_amount_minor")
    private Long paymentAmountMinor;

    @Column(name = "payment_deadline_at")
    private Instant paymentDeadlineAt;

    @Column(name = "reservation_expires_at")
    private Instant reservationExpiresAt;

    @Column(name = "invite_code", length = 32)
    private String inviteCode;

    @Column(name = "invite_expires_at")
    private Instant inviteExpiresAt;

    @Column(name = "reserved_player_count")
    private Integer reservedPlayerCount;

    protected SportsTeam() {
    }

    public SportsTeam(UUID id, String contextType, UUID contextId, String name, String captainUserId, String status,
            Instant createdAt) {
        this(id, contextType, contextId, name, captainUserId, status, createdAt, null, null, null);
    }

    public SportsTeam(UUID id, String contextType, UUID contextId, String name, String captainUserId, String status,
            Instant createdAt, Long paymentAmountMinor, Instant paymentDeadlineAt, Instant reservationExpiresAt) {
        this.id = id;
        this.contextType = contextType;
        this.contextId = contextId;
        this.name = name;
        this.captainUserId = captainUserId;
        this.status = status;
        this.createdAt = createdAt;
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

    public String getName() {
        return this.name;
    }

    public String getCaptainUserId() {
        return this.captainUserId;
    }

    public String getStatus() {
        return this.status;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
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

    public String getInviteCode() {
        return this.inviteCode;
    }

    public Instant getInviteExpiresAt() {
        return this.inviteExpiresAt;
    }

    public Integer getReservedPlayerCount() {
        return this.reservedPlayerCount;
    }

    public void configureInvite(String inviteCode, Instant inviteExpiresAt, Integer reservedPlayerCount) {
        this.inviteCode = inviteCode;
        this.inviteExpiresAt = inviteExpiresAt;
        this.reservedPlayerCount = reservedPlayerCount;
    }

    public boolean isInviteActive(Instant now) {
        return this.inviteCode != null && !this.inviteCode.isBlank() && this.inviteExpiresAt != null
                && now.isBefore(this.inviteExpiresAt);
    }

    public void confirmPayment() {
        this.status = "CONFIRMED";
    }

    public boolean isPlaceholderSlot() {
        return this.captainUserId != null && this.captainUserId.startsWith("slot:");
    }

    public void claimSlot(String newName, String newCaptainUserId, Instant claimedAt) {
        this.name = newName;
        this.captainUserId = newCaptainUserId;
        this.status = "CONFIRMED";
        this.createdAt = claimedAt;
    }

    public void cancelPayment() {
        if ("PENDING_PAYMENT".equals(this.status)) {
            this.status = "CANCELLED";
        }
    }

    public void cancelByTournament() {
        this.status = "CANCELLED";
    }
}

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

    protected SportsTeam() {
    }

    public SportsTeam(UUID id, String contextType, UUID contextId, String name, String captainUserId, String status,
            Instant createdAt) {
        this.id = id;
        this.contextType = contextType;
        this.contextId = contextId;
        this.name = name;
        this.captainUserId = captainUserId;
        this.status = status;
        this.createdAt = createdAt;
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
}

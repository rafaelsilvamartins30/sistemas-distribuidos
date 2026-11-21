package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sports_team_members")
public class SportsTeamMember {

    @Id
    private UUID id;

    @Column(name = "team_id", nullable = false)
    private UUID teamId;

    @Column(name = "user_id", length = 128)
    private String userId;

    @Column(name = "display_name", nullable = false, length = 160)
    private String displayName;

    @Column(nullable = false, length = 32)
    private String role;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    protected SportsTeamMember() {
    }

    public SportsTeamMember(UUID id, UUID teamId, String userId, String displayName, String role, Instant joinedAt) {
        this.id = id;
        this.teamId = teamId;
        this.userId = userId;
        this.displayName = displayName;
        this.role = role;
        this.joinedAt = joinedAt;
    }

    public UUID getId() {
        return this.id;
    }

    public UUID getTeamId() {
        return this.teamId;
    }

    public String getUserId() {
        return this.userId;
    }

    public String getDisplayName() {
        return this.displayName;
    }

    public String getRole() {
        return this.role;
    }

    public Instant getJoinedAt() {
        return this.joinedAt;
    }
}

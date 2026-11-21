package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sports_match_checkins")
public class SportsMatchCheckIn {

    @Id
    private UUID id;

    @Column(name = "match_id", nullable = false)
    private UUID matchId;

    @Column(name = "user_id", nullable = false, length = 128)
    private String userId;

    @Column(name = "team_id", nullable = false)
    private UUID teamId;

    @Column(name = "checked_in_at", nullable = false)
    private Instant checkedInAt;

    protected SportsMatchCheckIn() {
    }

    public SportsMatchCheckIn(UUID id, UUID matchId, String userId, UUID teamId, Instant checkedInAt) {
        this.id = id;
        this.matchId = matchId;
        this.userId = userId;
        this.teamId = teamId;
        this.checkedInAt = checkedInAt;
    }

    public UUID getId() {
        return this.id;
    }

    public UUID getMatchId() {
        return this.matchId;
    }

    public String getUserId() {
        return this.userId;
    }

    public UUID getTeamId() {
        return this.teamId;
    }

    public Instant getCheckedInAt() {
        return this.checkedInAt;
    }
}

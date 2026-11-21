package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sports_matches")
public class SportsMatch {

    @Id
    private UUID id;

    @Column(name = "context_type", nullable = false, length = 16)
    private String contextType;

    @Column(name = "context_id", nullable = false)
    private UUID contextId;

    @Column(name = "round_number", nullable = false)
    private int roundNumber;

    @Column(name = "home_team_id", nullable = false)
    private UUID homeTeamId;

    @Column(name = "away_team_id", nullable = false)
    private UUID awayTeamId;

    @Column(name = "scheduled_at", nullable = false)
    private Instant scheduledAt;

    @Column(nullable = false, length = 200)
    private String location;

    @Column(name = "home_score")
    private Integer homeScore;

    @Column(name = "away_score")
    private Integer awayScore;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "checkin_token", length = 64)
    private String checkinToken;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected SportsMatch() {
    }

    public SportsMatch(UUID id, String contextType, UUID contextId, int roundNumber, UUID homeTeamId, UUID awayTeamId,
            Instant scheduledAt, String location, Integer homeScore, Integer awayScore, String status,
            String checkinToken, Instant createdAt) {
        this.id = id;
        this.contextType = contextType;
        this.contextId = contextId;
        this.roundNumber = roundNumber;
        this.homeTeamId = homeTeamId;
        this.awayTeamId = awayTeamId;
        this.scheduledAt = scheduledAt;
        this.location = location;
        this.homeScore = homeScore;
        this.awayScore = awayScore;
        this.status = status;
        this.checkinToken = checkinToken;
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

    public int getRoundNumber() {
        return this.roundNumber;
    }

    public UUID getHomeTeamId() {
        return this.homeTeamId;
    }

    public UUID getAwayTeamId() {
        return this.awayTeamId;
    }

    public Instant getScheduledAt() {
        return this.scheduledAt;
    }

    public String getLocation() {
        return this.location;
    }

    public Integer getHomeScore() {
        return this.homeScore;
    }

    public Integer getAwayScore() {
        return this.awayScore;
    }

    public String getStatus() {
        return this.status;
    }

    public String getCheckinToken() {
        return this.checkinToken;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public void recordScore(int home, int away) {
        this.homeScore = home;
        this.awayScore = away;
        this.status = "COMPLETED";
    }

    public void updateCheckinToken(String token) {
        this.checkinToken = token;
    }
}

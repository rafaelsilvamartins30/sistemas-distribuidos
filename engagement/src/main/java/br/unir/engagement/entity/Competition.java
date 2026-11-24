package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "competitions")
public class Competition {

    @Id
    private UUID id;

    @Column(nullable = false, length = 200)
    private String title;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sport_id", nullable = false)
    private Sport sport;

    @Column(name = "skill_level", nullable = false, length = 80)
    private String skillLevel;

    @Column(name = "organizer_type", nullable = false, length = 80)
    private String organizerType;

    @Column(name = "organizer_id", nullable = false)
    private UUID organizerId;

    @Column(name = "target_team_count", nullable = false)
    private int targetTeamCount;

    @Column(name = "roster_min", nullable = false)
    private int rosterMin;

    @Column(name = "roster_max", nullable = false)
    private int rosterMax;

    @Column(name = "team_entry_price", nullable = false)
    private long teamEntryPrice;

    @Column(name = "free_agent_price", nullable = false)
    private long freeAgentPrice;

    @Column(name = "registration_deadline", nullable = false)
    private Instant registrationDeadline;

    // The source defines this field but does not yet define its vocabulary.
    @Column(length = 80)
    private String status;

    @Column(nullable = false, length = 32)
    private String format;

    protected Competition() {
    }

    public Competition(UUID id, String title, Sport sport, String skillLevel, String organizerType, UUID organizerId,
            int targetTeamCount, int rosterMin, int rosterMax, long teamEntryPrice, long freeAgentPrice,
            Instant registrationDeadline, String status, String format) {
        this.id = id;
        this.title = title;
        this.sport = sport;
        this.skillLevel = skillLevel;
        this.organizerType = organizerType;
        this.organizerId = organizerId;
        this.targetTeamCount = targetTeamCount;
        this.rosterMin = rosterMin;
        this.rosterMax = rosterMax;
        this.teamEntryPrice = teamEntryPrice;
        this.freeAgentPrice = freeAgentPrice;
        this.registrationDeadline = registrationDeadline;
        this.status = status;
        this.format = format;
    }

    public UUID getId() {
        return this.id;
    }
    public String getTitle() {
        return this.title;
    }
    public Sport getSport() {
        return this.sport;
    }
    public String getSkillLevel() {
        return this.skillLevel;
    }
    public String getOrganizerType() {
        return this.organizerType;
    }
    public UUID getOrganizerId() {
        return this.organizerId;
    }
    public int getTargetTeamCount() {
        return this.targetTeamCount;
    }
    public int getRosterMin() {
        return this.rosterMin;
    }
    public int getRosterMax() {
        return this.rosterMax;
    }
    public long getTeamEntryPrice() {
        return this.teamEntryPrice;
    }
    public long getFreeAgentPrice() {
        return this.freeAgentPrice;
    }
    public Instant getRegistrationDeadline() {
        return this.registrationDeadline;
    }
    public void openSchedule() {
        if ("OPEN".equals(this.status)) {
            this.status = "ACTIVE";
        }
    }

    public String getStatus() {
        return this.status;
    }
    public String getFormat() {
        return this.format;
    }

    public void updateRegistrationDeadline(Instant registrationDeadline) {
        this.registrationDeadline = registrationDeadline;
    }

    public void cancel() {
        this.status = "CANCELLED";
    }
}

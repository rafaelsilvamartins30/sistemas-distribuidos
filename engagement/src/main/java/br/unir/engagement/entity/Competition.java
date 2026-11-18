package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "manager_user_ids", nullable = false, columnDefinition = "uuid[]")
    private UUID[] managerUserIds;

    @Column(name = "target_team_count", nullable = false)
    private int targetTeamCount;

    @Column(name = "roster_min", nullable = false)
    private int rosterMin;

    @Column(name = "roster_max", nullable = false)
    private int rosterMax;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "tie_breakers", nullable = false, columnDefinition = "varchar[]")
    private String[] tieBreakers;

    @Column(name = "team_entry_price", nullable = false)
    private long teamEntryPrice;

    @Column(name = "free_agent_price", nullable = false)
    private long freeAgentPrice;

    @Column(name = "registration_deadline", nullable = false)
    private Instant registrationDeadline;

    @Column(name = "draw_seed")
    private Long drawSeed;

    // The source defines this field but does not yet define its vocabulary.
    @Column(length = 80)
    private String status;

    @Column(nullable = false, length = 32)
    private String format;

    protected Competition() {
    }

    public Competition(UUID id, String title, Sport sport, String skillLevel, String organizerType, UUID organizerId,
            UUID[] managerUserIds, int targetTeamCount, int rosterMin, int rosterMax, String[] tieBreakers,
            long teamEntryPrice, long freeAgentPrice, Instant registrationDeadline, Long drawSeed, String status,
            String format) {
        this.id = id;
        this.title = title;
        this.sport = sport;
        this.skillLevel = skillLevel;
        this.organizerType = organizerType;
        this.organizerId = organizerId;
        this.managerUserIds = managerUserIds == null
                ? new UUID[0]
                : Arrays.copyOf(managerUserIds, managerUserIds.length);
        this.targetTeamCount = targetTeamCount;
        this.rosterMin = rosterMin;
        this.rosterMax = rosterMax;
        this.tieBreakers = tieBreakers == null ? new String[0] : Arrays.copyOf(tieBreakers, tieBreakers.length);
        this.teamEntryPrice = teamEntryPrice;
        this.freeAgentPrice = freeAgentPrice;
        this.registrationDeadline = registrationDeadline;
        this.drawSeed = drawSeed;
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
    public UUID[] getManagerUserIds() {
        return Arrays.copyOf(this.managerUserIds, this.managerUserIds.length);
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
    public String[] getTieBreakers() {
        return Arrays.copyOf(this.tieBreakers, this.tieBreakers.length);
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
    public Long getDrawSeed() {
        return this.drawSeed;
    }
    public String getStatus() {
        return this.status;
    }
    public String getFormat() {
        return this.format;
    }
}

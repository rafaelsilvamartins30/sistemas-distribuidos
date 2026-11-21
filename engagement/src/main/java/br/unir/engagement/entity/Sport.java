package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "sports")
public class Sport {

    @Id
    private UUID id;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(name = "players_on_field", nullable = false)
    private int playersOnField;

    @Column(name = "minimum_roster", nullable = false)
    private int minimumRoster;

    @Column(name = "maximum_roster", nullable = false)
    private int maximumRoster;

    @Column(name = "allows_draw", nullable = false)
    private boolean allowsDraw;

    @Column(name = "win_points", nullable = false)
    private int winPoints;

    @Column(name = "draw_points", nullable = false)
    private int drawPoints;

    @Column(name = "loss_points", nullable = false)
    private int lossPoints;

    @Column(name = "default_forfeit_score", nullable = false)
    private int defaultForfeitScore;

    @Column(name = "rules_markdown", nullable = false, columnDefinition = "text")
    private String rulesMarkdown;

    @Column(name = "created_by_type", nullable = false, length = 80)
    private String createdByType;

    @Column(name = "created_by_id", nullable = false)
    private UUID createdById;

    // The source defines this field but does not yet define its vocabulary.
    @Column(length = 80)
    private String status;

    protected Sport() {
    }

    public Sport(UUID id, String name, int playersOnField, int minimumRoster, int maximumRoster, boolean allowsDraw,
            int winPoints, int drawPoints, int lossPoints, int defaultForfeitScore, String rulesMarkdown,
            String createdByType, UUID createdById, String status) {
        this.id = id;
        this.name = name;
        this.playersOnField = playersOnField;
        this.minimumRoster = minimumRoster;
        this.maximumRoster = maximumRoster;
        this.allowsDraw = allowsDraw;
        this.winPoints = winPoints;
        this.drawPoints = drawPoints;
        this.lossPoints = lossPoints;
        this.defaultForfeitScore = defaultForfeitScore;
        this.rulesMarkdown = rulesMarkdown;
        this.createdByType = createdByType;
        this.createdById = createdById;
        this.status = status;
    }

    public UUID getId() {
        return this.id;
    }
    public String getName() {
        return this.name;
    }
    public int getPlayersOnField() {
        return this.playersOnField;
    }
    public int getMinimumRoster() {
        return this.minimumRoster;
    }
    public int getMaximumRoster() {
        return this.maximumRoster;
    }
    public boolean isAllowsDraw() {
        return this.allowsDraw;
    }
    public int getWinPoints() {
        return this.winPoints;
    }
    public int getDrawPoints() {
        return this.drawPoints;
    }
    public int getLossPoints() {
        return this.lossPoints;
    }
    public int getDefaultForfeitScore() {
        return this.defaultForfeitScore;
    }
    public String getRulesMarkdown() {
        return this.rulesMarkdown;
    }
    public String getCreatedByType() {
        return this.createdByType;
    }
    public UUID getCreatedById() {
        return this.createdById;
    }
    public String getStatus() {
        return this.status;
    }
}

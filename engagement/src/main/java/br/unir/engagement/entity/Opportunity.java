package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "opportunities")
public class Opportunity {

    private static final String ACTIVE_STATUS = "ACTIVE";

    @Id
    private UUID id;

    @Column(nullable = false, columnDefinition = "text")
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "publisher_type", nullable = false, length = 32)
    private String publisherType;

    @Column(name = "publisher_id", nullable = false)
    private UUID publisherId;

    @Column(nullable = false, columnDefinition = "text")
    private String category;

    private Instant deadline;

    @Column(name = "external_url", nullable = false, columnDefinition = "text")
    private String externalUrl;

    @Column(name = "image_url", columnDefinition = "text")
    private String imageUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false, length = 80)
    private String status;

    protected Opportunity() {
    }

    public Opportunity(UUID id, String title, String description, String publisherType, UUID publisherId,
            String category, Instant deadline, String externalUrl, String imageUrl, Instant createdAt, String status) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.publisherType = publisherType;
        this.publisherId = publisherId;
        this.category = category;
        this.deadline = deadline;
        this.externalUrl = externalUrl;
        this.imageUrl = imageUrl;
        this.createdAt = createdAt;
        this.status = status;
    }

    @PrePersist
    void setCreatedAtIfMissing() {
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
    }

    public UUID getId() {
        return this.id;
    }

    public String getTitle() {
        return this.title;
    }

    public String getDescription() {
        return this.description;
    }

    public String getPublisherType() {
        return this.publisherType;
    }

    public UUID getPublisherId() {
        return this.publisherId;
    }

    public String getCategory() {
        return this.category;
    }

    public Instant getDeadline() {
        return this.deadline;
    }

    public String getExternalUrl() {
        return this.externalUrl;
    }

    public String getImageUrl() {
        return this.imageUrl;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public String getStatus() {
        return this.status;
    }

    public static String activeStatus() {
        return ACTIVE_STATUS;
    }
}

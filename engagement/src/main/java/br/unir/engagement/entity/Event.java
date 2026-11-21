package br.unir.engagement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "events")
public class Event {

    @Id
    private UUID id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "organizer_type", nullable = false, length = 80)
    private String organizerType;

    @Column(name = "organizer_id", nullable = false)
    private UUID organizerId;

    @Column(name = "created_by_user_id", length = 255)
    private String createdByUserId;

    @Column(name = "image_url", length = 2048)
    private String imageUrl;

    @Column(nullable = false, length = 255)
    private String location;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    @Column(nullable = false, length = 100)
    private String category;

    private Integer capacity;

    @Column(name = "registration_deadline", nullable = false)
    private Instant registrationDeadline;

    @Enumerated(EnumType.STRING)
    @Column(name = "registration_mode", nullable = false, length = 32)
    private RegistrationMode registrationMode;

    /** Monetary value in minor units, as defined by the shared API conventions. */
    private Long price;

    @Column(name = "external_url", length = 2048)
    private String externalUrl;

    @Column(name = "attendance_enabled", nullable = false)
    private boolean attendanceEnabled;

    @Enumerated(EnumType.STRING)
    @Column(name = "attendance_mode", length = 40)
    private AttendanceMode attendanceMode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EventStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    @Column(nullable = false)
    private long version;

    protected Event() {
    }

    public Event(UUID id, String title, String description, String organizerType, UUID organizerId, String imageUrl,
            String location, Instant startsAt, Instant endsAt, String category, Integer capacity,
            Instant registrationDeadline, RegistrationMode registrationMode, Long price, String externalUrl,
            boolean attendanceEnabled, AttendanceMode attendanceMode, EventStatus status, Instant createdAt) {
        this(id, title, description, organizerType, organizerId, imageUrl, location, startsAt, endsAt, category,
                capacity, registrationDeadline, registrationMode, price, externalUrl, attendanceEnabled, attendanceMode,
                status, createdAt, null);
    }

    public Event(UUID id, String title, String description, String organizerType, UUID organizerId, String imageUrl,
            String location, Instant startsAt, Instant endsAt, String category, Integer capacity,
            Instant registrationDeadline, RegistrationMode registrationMode, Long price, String externalUrl,
            boolean attendanceEnabled, AttendanceMode attendanceMode, EventStatus status, Instant createdAt,
            String createdByUserId) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.organizerType = organizerType;
        this.organizerId = organizerId;
        this.createdByUserId = createdByUserId;
        this.imageUrl = imageUrl;
        this.location = location;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        this.category = category;
        this.capacity = capacity;
        this.registrationDeadline = registrationDeadline;
        this.registrationMode = registrationMode;
        this.price = price;
        this.externalUrl = externalUrl;
        this.attendanceEnabled = attendanceEnabled;
        this.attendanceMode = attendanceMode;
        this.status = status;
        this.createdAt = createdAt;
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

    public String getOrganizerType() {
        return this.organizerType;
    }

    public UUID getOrganizerId() {
        return this.organizerId;
    }

    public String getCreatedByUserId() {
        return this.createdByUserId;
    }

    public String getImageUrl() {
        return this.imageUrl;
    }

    public String getLocation() {
        return this.location;
    }

    public Instant getStartsAt() {
        return this.startsAt;
    }

    public Instant getEndsAt() {
        return this.endsAt;
    }

    public String getCategory() {
        return this.category;
    }

    public Integer getCapacity() {
        return this.capacity;
    }

    public Instant getRegistrationDeadline() {
        return this.registrationDeadline;
    }

    public RegistrationMode getRegistrationMode() {
        return this.registrationMode;
    }

    public Long getPrice() {
        return this.price;
    }

    public String getExternalUrl() {
        return this.externalUrl;
    }

    public boolean isAttendanceEnabled() {
        return this.attendanceEnabled;
    }

    public AttendanceMode getAttendanceMode() {
        return this.attendanceMode;
    }

    public EventStatus getStatus() {
        return this.status;
    }

    public void updateDetails(String title, String description, String imageUrl, String location, Instant startsAt,
            Instant endsAt, String category, Integer capacity, Instant registrationDeadline,
            RegistrationMode registrationMode, Long price, String externalUrl, boolean attendanceEnabled,
            AttendanceMode attendanceMode) {
        this.title = title;
        this.description = description;
        this.imageUrl = imageUrl;
        this.location = location;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        this.category = category;
        this.capacity = capacity;
        this.registrationDeadline = registrationDeadline;
        this.registrationMode = registrationMode;
        this.price = price;
        this.externalUrl = externalUrl;
        this.attendanceEnabled = attendanceEnabled;
        this.attendanceMode = attendanceMode;
    }

    /**
     * Marks this event terminally cancelled; this entity exposes no reactivation
     * operation.
     */
    public void cancel() {
        this.status = EventStatus.CANCELLED;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public long getAggregateVersion() {
        return this.version;
    }
}

package br.unir.users.entity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.data.domain.Persistable;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User implements Persistable<String> {

    @Id
    private String id;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String institutionalId;

    @Column(nullable = false)
    private String course;

    @Column(nullable = false)
    private String department;

    @ElementCollection
    @CollectionTable(name = "user_interests", joinColumns = @JoinColumn(name = "user_id"))
    @OrderColumn(name = "position")
    @Column(name = "interest", nullable = false)
    private List<String> interests = new ArrayList<>();

    protected User() {
    }

    public User(String id, String name, String institutionalId, String course, String department,
            List<String> interests) {
        this.id = id;
        this.name = name;
        this.institutionalId = institutionalId;
        this.course = course;
        this.department = department;
        this.interests = new ArrayList<>(interests);
    }

    @Override
    public boolean isNew() {
        // Assigned IDs must use INSERT rather than merge an existing user.
        return this.createdAt == null;
    }

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }

    @Override
    public String getId() {
        return this.id;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public Instant getUpdatedAt() {
        return this.updatedAt;
    }

    public String getName() {
        return this.name;
    }

    public void update(String name, String course, String department, List<String> interests) {
        this.name = name;
        this.course = course;
        this.department = department;
        this.interests = new ArrayList<>(interests);
    }

    public String getInstitutionalId() {
        return this.institutionalId;
    }

    public String getCourse() {
        return this.course;
    }

    public String getDepartment() {
        return this.department;
    }

    public List<String> getInterests() {
        return this.interests;
    }
}

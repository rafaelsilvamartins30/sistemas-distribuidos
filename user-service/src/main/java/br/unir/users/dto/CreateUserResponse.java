package br.unir.users.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import br.unir.users.entity.AcademicLevel;
import br.unir.users.entity.AffiliationStatus;

public record CreateUserResponse(String id, String name, String institutionalId, AffiliationStatus affiliationStatus,
        AcademicLevel academicLevel, String course, String department, List<String> interests, Instant createdAt,
        Instant updatedAt) {
    public CreateUserResponse {
        interests = interests == null ? null : Collections.unmodifiableList(new ArrayList<>(interests));
    }

    @Override
    public List<String> interests() {
        return interests == null ? null : Collections.unmodifiableList(interests);
    }
}

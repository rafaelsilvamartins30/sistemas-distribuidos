package br.unir.users.dto;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import br.unir.users.entity.AcademicLevel;
import br.unir.users.entity.AffiliationStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateUserRequest(@Pattern(regexp = "(?s).*\\S.*") @Size(max = 255) String name,
        AffiliationStatus affiliationStatus, AcademicLevel academicLevel,
        @Pattern(regexp = "(?s).*\\S.*") @Size(max = 255) String course,
        @Pattern(regexp = "(?s).*\\S.*") @Size(max = 255) String department,
        List<@NotBlank @Size(max = 255) String> interests) {
    public UpdateUserRequest {
        interests = interests == null ? null : Collections.unmodifiableList(new ArrayList<>(interests));
    }

    @Override
    public List<String> interests() {
        return interests == null ? null : Collections.unmodifiableList(interests);
    }
}

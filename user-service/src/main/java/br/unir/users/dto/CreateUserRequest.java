package br.unir.users.dto;

import java.util.List;

import br.unir.users.entity.AcademicLevel;
import br.unir.users.entity.AffiliationStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(@NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 255) String institutionalId, @NotNull AffiliationStatus affiliationStatus,
        @NotNull AcademicLevel academicLevel, @NotBlank @Size(max = 255) String course,
        @NotBlank @Size(max = 255) String department, List<@NotBlank @Size(max = 255) String> interests) {
}

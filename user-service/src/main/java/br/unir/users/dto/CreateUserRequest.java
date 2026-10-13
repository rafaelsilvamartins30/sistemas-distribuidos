package br.unir.users.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(@NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 255) String institutionalId, @NotBlank @Size(max = 255) String course,
        @NotBlank @Size(max = 255) String department, List<@NotBlank @Size(max = 255) String> interests) {
}

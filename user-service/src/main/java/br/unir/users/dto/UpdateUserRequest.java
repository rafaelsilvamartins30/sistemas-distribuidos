package br.unir.users.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateUserRequest(@Pattern(regexp = "(?s).*\\S.*") @Size(max = 255) String name,
        @Pattern(regexp = "(?s).*\\S.*") @Size(max = 255) String course,
        @Pattern(regexp = "(?s).*\\S.*") @Size(max = 255) String department,
        List<@NotBlank @Size(max = 255) String> interests) {
}

package br.unir.users.dto;

import java.time.Instant;
import java.util.List;

public record CreateUserResponse(String id, String name, String institutionalId, String course, String department,
        List<String> interests, Instant createdAt, Instant updatedAt) {
}

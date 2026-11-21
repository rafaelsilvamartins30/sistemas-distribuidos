package br.unir.engagement.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record CreateOpportunityRequest(@NotBlank String title, @NotBlank String description,
        @NotBlank String publisherType, @NotNull UUID publisherId, @NotBlank String category, Instant deadline,
        @NotBlank String externalUrl, String imageUrl) {
}

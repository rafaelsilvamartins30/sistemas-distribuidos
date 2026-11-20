package br.unir.engagement.dto;

import java.time.Instant;

public record UpdateOpportunityRequest(String title, String description, String category, Instant deadline,
        Boolean clearDeadline, String externalUrl, String imageUrl, Boolean clearImageUrl, String status) {
}

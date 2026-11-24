package br.unir.engagement.dto;

import br.unir.engagement.entity.Opportunity;
import java.time.Instant;
import java.util.UUID;

public record OpportunityResponse(UUID id, String title, String description, String publisherType, UUID publisherId,
        String category, Instant deadline, String externalUrl, String imageUrl, Instant createdAt, String status,
        boolean available, boolean canManage, boolean canClose, boolean canReactivate) {

    public static OpportunityResponse from(Opportunity opportunity) {
        return from(opportunity, false);
    }

    public static OpportunityResponse from(Opportunity opportunity, boolean canManage) {
        boolean active = Opportunity.activeStatus().equals(opportunity.getStatus());
        boolean available = active
                && (opportunity.getDeadline() == null || opportunity.getDeadline().isAfter(Instant.now()));
        return new OpportunityResponse(opportunity.getId(), opportunity.getTitle(), opportunity.getDescription(),
                opportunity.getPublisherType(), opportunity.getPublisherId(), opportunity.getCategory(),
                opportunity.getDeadline(), opportunity.getExternalUrl(), opportunity.getImageUrl(),
                opportunity.getCreatedAt(), opportunity.getStatus(), available, canManage, canManage && active,
                canManage && !available);
    }
}

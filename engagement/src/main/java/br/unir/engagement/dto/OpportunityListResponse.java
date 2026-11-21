package br.unir.engagement.dto;

import java.util.List;
import org.springframework.data.domain.Page;

public record OpportunityListResponse(List<OpportunityResponse> items, int page, int size, long totalElements,
        int totalPages) {

    public OpportunityListResponse {
        items = List.copyOf(items);
    }

    public static OpportunityListResponse from(Page<OpportunityResponse> opportunities) {
        return new OpportunityListResponse(opportunities.getContent(), opportunities.getNumber(),
                opportunities.getSize(), opportunities.getTotalElements(), opportunities.getTotalPages());
    }
}

package br.unir.engagement.dto;

import java.util.List;

public record OpportunityPublisherContextsResponse(List<OpportunityPublisherContext> items) {

    public OpportunityPublisherContextsResponse {
        items = List.copyOf(items);
    }
}

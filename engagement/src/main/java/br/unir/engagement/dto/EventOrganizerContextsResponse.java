package br.unir.engagement.dto;

import java.util.List;

public record EventOrganizerContextsResponse(List<EventOrganizerContext> items) {

    public EventOrganizerContextsResponse {
        items = List.copyOf(items);
    }
}

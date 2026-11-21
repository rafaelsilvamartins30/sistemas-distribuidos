package br.unir.engagement.dto;

import java.util.List;
import org.springframework.data.domain.Page;

public record EventListResponse(List<EventResponse> items, int page, int size, long totalElements, int totalPages) {

    public EventListResponse {
        items = List.copyOf(items);
    }

    public static EventListResponse from(Page<EventResponse> events) {
        return new EventListResponse(events.getContent(), events.getNumber(), events.getSize(),
                events.getTotalElements(), events.getTotalPages());
    }
}

package br.unir.engagement.dto;

import java.util.List;
import org.springframework.data.domain.Page;

public record SeasonListResponse(List<SeasonResponse> items, int page, int size, long totalElements, int totalPages) {

    public SeasonListResponse {
        items = List.copyOf(items);
    }

    public static SeasonListResponse from(Page<SeasonResponse> page) {
        return new SeasonListResponse(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements(),
                page.getTotalPages());
    }
}

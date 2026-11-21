package br.unir.engagement.dto;

import java.util.List;
import org.springframework.data.domain.Page;

public record CompetitionListResponse(List<CompetitionResponse> items, int page, int size, long totalElements,
        int totalPages) {

    public CompetitionListResponse {
        items = List.copyOf(items);
    }

    public static CompetitionListResponse from(Page<CompetitionResponse> page) {
        return new CompetitionListResponse(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements(),
                page.getTotalPages());
    }
}

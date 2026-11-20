package br.unir.engagement.dto;

import java.util.List;
import org.springframework.data.domain.Page;

public record SportListResponse(List<SportResponse> items, int page, int size, long totalElements, int totalPages) {

    public SportListResponse {
        items = List.copyOf(items);
    }

    public static SportListResponse from(Page<SportResponse> page) {
        return new SportListResponse(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements(),
                page.getTotalPages());
    }
}

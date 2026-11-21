package br.unir.engagement.dto;

import java.util.List;
import org.springframework.data.domain.Page;

public record RegistrationListResponse(List<RegistrationResponse> items, int page, int size, long totalElements,
        int totalPages) {

    public RegistrationListResponse {
        items = List.copyOf(items);
    }

    public static RegistrationListResponse from(Page<RegistrationResponse> registrations) {
        return new RegistrationListResponse(registrations.getContent(), registrations.getNumber(),
                registrations.getSize(), registrations.getTotalElements(), registrations.getTotalPages());
    }
}

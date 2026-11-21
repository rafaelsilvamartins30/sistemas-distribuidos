package br.unir.engagement.dto;

import java.util.List;

public record MySportsEnrollmentsResponse(List<MySportsEnrollmentResponse> items) {

    public MySportsEnrollmentsResponse {
        items = items == null ? List.of() : List.copyOf(items);
    }
}

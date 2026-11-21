package br.unir.engagement.dto;

import java.util.List;

public record MySportsMatchesResponse(List<MySportsMatchResponse> items) {

    public MySportsMatchesResponse {
        items = items == null ? List.of() : List.copyOf(items);
    }
}

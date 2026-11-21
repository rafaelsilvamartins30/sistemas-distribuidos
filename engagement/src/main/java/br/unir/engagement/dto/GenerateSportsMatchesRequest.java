package br.unir.engagement.dto;

import java.time.Instant;

public record GenerateSportsMatchesRequest(Instant firstMatchAt, String location) {
}

package br.unir.engagement.dto;

import java.util.List;
import java.util.UUID;

public final class SportsStandingsResponse {
    public record Row(UUID teamId, String teamName, int rank, int played, int wins, int draws, int losses, int goalsFor,
            int goalsAgainst, int goalDiff, int points, boolean qualified) {
    }

    public record Table(String groupName, List<Row> rows) {
        public Table {
            rows = rows == null ? List.of() : List.copyOf(rows);
        }
    }

    private SportsStandingsResponse() {
    }
}

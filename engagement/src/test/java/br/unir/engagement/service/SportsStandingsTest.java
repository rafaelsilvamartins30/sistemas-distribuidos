package br.unir.engagement.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.unir.engagement.dto.SportsStandingsResponse.Row;
import br.unir.engagement.entity.Sport;
import br.unir.engagement.entity.SportsMatch;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SportsStandingsTest {
    private final UUID seasonId = UUID.randomUUID();
    private final UUID a = UUID.randomUUID();
    private final UUID b = UUID.randomUUID();
    private final UUID c = UUID.randomUUID();
    private final Sport sport = new Sport(UUID.randomUUID(), "Futsal", 5, 5, 8, true, 3, 1, 0, 3, "Regras.",
            "UNIVERSITY", UUID.randomUUID(), "ACTIVE");

    @Test
    void threeTeamTieUsesWinsThenScoringWithoutAddingAPlayoff() {
        var result = SportsStandings.calculate(true, this.sport, Map.of(this.a, "A", this.b, "B", this.c, "C"),
                List.of(game(1, this.a, this.b, 8, 6), game(2, this.b, this.c, 4, 0), game(3, this.c, this.a, 5, 4)));
        assertEquals(List.of(this.a, this.b, this.c),
                result.tables().getFirst().rows().stream().map(Row::teamId).toList());
        assertTrue(result.playoffs().isEmpty());
    }

    @Test
    void twoTeamTiebreakDoesNotChangeRegularPointsOrScoring() {
        Map<UUID, String> teams = Map.of(this.a, "A", this.b, "B");
        SportsMatch regular = game(1, this.a, this.b, 1, 1);
        var pending = SportsStandings.calculate(true, this.sport, teams, List.of(regular));
        var pair = pending.playoffs().getFirst();
        assertEquals(List.of(1, 1), pending.tables().getFirst().rows().stream().map(Row::rank).toList());

        var decided = SportsStandings.calculate(true, this.sport, teams,
                List.of(regular, game(SportsStandings.TIEBREAK_ROUND, pair.home(), pair.away(), 2, 3)));
        assertTrue(decided.playoffs().isEmpty());
        var rows = decided.tables().getFirst().rows();
        assertEquals(pair.away(), rows.getFirst().teamId());
        assertEquals(List.of(1, 1), rows.stream().map(Row::points).toList());
        assertEquals(List.of(1, 1), rows.stream().map(Row::goalsFor).toList());
    }

    private SportsMatch game(int round, UUID home, UUID away, int homeScore, int awayScore) {
        Instant date = Instant.parse("2027-06-03T21:00:00Z");
        return new SportsMatch(UUID.randomUUID(), "SEASON", this.seasonId, round, home, away, date, "Quadra", homeScore,
                awayScore, "COMPLETED", null, date);
    }
}

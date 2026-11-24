package br.unir.engagement.service;

import br.unir.engagement.entity.SportsMatch;
import java.util.List;
import java.util.UUID;

final class SportsKnockout {

    record Result(Integer home, Integer away, UUID winnerTeamId) {
    }

    static SportsMatch pairedLeg(List<SportsMatch> schedule, SportsMatch match, int round) {
        return schedule.stream().filter(game -> game.getRoundNumber() == round)
                .filter(game -> (game.getHomeTeamId().equals(match.getHomeTeamId())
                        && game.getAwayTeamId().equals(match.getAwayTeamId()))
                        || (game.getHomeTeamId().equals(match.getAwayTeamId())
                                && game.getAwayTeamId().equals(match.getHomeTeamId())))
                .findFirst().orElse(null);
    }

    static int scoreFor(SportsMatch game, UUID teamId) {
        Integer score = game.getHomeTeamId().equals(teamId) ? game.getHomeScore() : game.getAwayScore();
        return score == null ? 0 : score;
    }

    static Result result(SportsMatch first, SportsMatch second) {
        UUID home = first.getHomeTeamId();
        UUID away = first.getAwayTeamId();
        int homeTotal = scoreFor(first, home) + (second == null ? 0 : scoreFor(second, home));
        int awayTotal = scoreFor(first, away) + (second == null ? 0 : scoreFor(second, away));
        SportsMatch deciding = first.getRoundNumber() == 10 ? first : second;
        UUID winner = null;
        if (first.getHomeScore() != null && deciding != null && deciding.getHomeScore() != null) {
            if (homeTotal != awayTotal) {
                winner = homeTotal > awayTotal ? home : away;
            } else if (deciding.getHomePenaltyScore() != null && deciding.getAwayPenaltyScore() != null
                    && !deciding.getHomePenaltyScore().equals(deciding.getAwayPenaltyScore())) {
                winner = deciding.getHomePenaltyScore() > deciding.getAwayPenaltyScore()
                        ? deciding.getHomeTeamId()
                        : deciding.getAwayTeamId();
            }
        }
        return new Result(homeTotal, awayTotal, winner);
    }

    private SportsKnockout() {
    }
}

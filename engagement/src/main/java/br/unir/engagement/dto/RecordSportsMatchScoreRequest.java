package br.unir.engagement.dto;

public record RecordSportsMatchScoreRequest(Integer homeScore, Integer awayScore, Integer homePenaltyScore,
        Integer awayPenaltyScore) {

    public RecordSportsMatchScoreRequest(Integer homeScore, Integer awayScore) {
        this(homeScore, awayScore, null, null);
    }
}

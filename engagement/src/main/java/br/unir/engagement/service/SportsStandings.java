package br.unir.engagement.service;

import br.unir.engagement.dto.SportsStandingsResponse.Row;
import br.unir.engagement.dto.SportsStandingsResponse.Table;
import br.unir.engagement.entity.Sport;
import br.unir.engagement.entity.SportsMatch;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.TreeMap;

final class SportsStandings {
    static final int TIEBREAK_ROUND = 100;
    private static final Comparator<Stats> MULTI_TEAM_ORDER = Comparator.comparingInt((Stats s) -> s.wins).reversed()
            .thenComparing(Comparator.comparingInt((Stats s) -> s.scored).reversed()).thenComparingInt(s -> s.conceded);

    private static final Comparator<Stats> GROUP_ORDER = Comparator.comparingInt((Stats s) -> s.wins).reversed()
            .thenComparing(Comparator.comparingInt((Stats s) -> s.scored - s.conceded).reversed())
            .thenComparing(Comparator.comparingInt((Stats s) -> s.scored).reversed());

    record Playoff(UUID home, UUID away) {
    }

    record Result(List<Table> tables, List<Playoff> playoffs) {
    }

    private static final class Stats {
        private int played;
        private int wins;
        private int draws;
        private int losses;
        private int scored;
        private int conceded;
        private int points;

        void record(int score, int against, Sport sport) {
            this.played++;
            this.scored += score;
            this.conceded += against;
            if (score > against) {
                this.wins++;
                this.points += sport.getWinPoints();
            } else if (score == against) {
                this.draws++;
                this.points += sport.getDrawPoints();
            } else {
                this.losses++;
                this.points += sport.getLossPoints();
            }
        }
    }

    static Result calculate(boolean season, Sport sport, Map<UUID, String> names, List<SportsMatch> matches) {
        List<SportsMatch> regular = matches.stream()
                .filter(match -> match.getRoundNumber() < TIEBREAK_ROUND && (season || match.getRoundNumber() <= 3))
                .toList();
        Map<String, Map<UUID, Stats>> groups = new TreeMap<>();
        if (season || regular.isEmpty()) {
            Map<UUID, Stats> all = new LinkedHashMap<>();
            names.keySet().forEach(id -> all.put(id, new Stats()));
            groups.put(season ? "Classificação" : "Fase de grupos", all);
        }
        for (SportsMatch match : regular) {
            Map<UUID, Stats> group = groups.computeIfAbsent(season ? "Classificação" : groupName(match.getLocation()),
                    ignored -> new LinkedHashMap<>());
            Stats home = group.computeIfAbsent(match.getHomeTeamId(), ignored -> new Stats());
            Stats away = group.computeIfAbsent(match.getAwayTeamId(), ignored -> new Stats());
            if (match.getHomeScore() != null && match.getAwayScore() != null) {
                home.record(match.getHomeScore(), match.getAwayScore(), sport);
                away.record(match.getAwayScore(), match.getHomeScore(), sport);
            }
        }
        boolean finished = !regular.isEmpty() && regular.stream().allMatch(match -> match.getHomeScore() != null);
        List<Table> tables = new ArrayList<>();
        List<Playoff> playoffs = new ArrayList<>();
        groups.forEach((label, group) -> tables.add(rank(label, group, names, matches, season, finished, playoffs)));
        return new Result(tables, playoffs);
    }

    private static Table rank(String label, Map<UUID, Stats> group, Map<UUID, String> names, List<SportsMatch> matches,
            boolean season, boolean finished, List<Playoff> playoffs) {
        Map<Integer, List<UUID>> byPoints = new TreeMap<>(Comparator.reverseOrder());
        group.keySet().stream().sorted(Comparator.comparing(UUID::toString))
                .forEach(id -> byPoints.computeIfAbsent(group.get(id).points, ignored -> new ArrayList<>()).add(id));
        List<List<UUID>> positions = new ArrayList<>();
        for (List<UUID> tied : byPoints.values()) {
            if (!season) {
                tied.stream()
                        .sorted(Comparator.<UUID, Stats>comparing(group::get, GROUP_ORDER)
                                .thenComparing(id -> names.getOrDefault(id, "Equipe"), String.CASE_INSENSITIVE_ORDER))
                        .forEach(team -> positions.add(List.of(team)));
            } else if (tied.size() == 1) {
                positions.add(tied);
            } else if (tied.size() == 2) {
                UUID home = tied.get(0);
                UUID away = tied.get(1);
                SportsMatch playoff = matches
                        .stream().filter(match -> match.getRoundNumber() == TIEBREAK_ROUND
                                && match.getHomeTeamId().equals(home) && match.getAwayTeamId().equals(away))
                        .findFirst().orElse(null);
                if (playoff != null && playoff.getHomeScore() != null) {
                    boolean homeWins = playoff.getHomeScore().equals(playoff.getAwayScore())
                            ? playoff.getHomePenaltyScore() > playoff.getAwayPenaltyScore()
                            : playoff.getHomeScore() > playoff.getAwayScore();
                    positions.add(List.of(homeWins ? home : away));
                    positions.add(List.of(homeWins ? away : home));
                } else {
                    if (finished && playoff == null) {
                        playoffs.add(new Playoff(home, away));
                    }
                    positions.add(tied);
                }
            } else {
                tied.sort(Comparator.comparing(group::get, MULTI_TEAM_ORDER));
                List<UUID> bucket = new ArrayList<>();
                for (UUID team : tied) {
                    if (!bucket.isEmpty() && MULTI_TEAM_ORDER.compare(group.get(bucket.get(0)), group.get(team)) != 0) {
                        positions.add(bucket);
                        bucket = new ArrayList<>();
                    }
                    bucket.add(team);
                }
                positions.add(bucket);
            }
        }

        int rank = 1;
        List<Row> rows = new ArrayList<>();
        for (List<UUID> bucket : positions) {
            boolean qualified = !season && finished && rank <= 2;
            for (UUID team : bucket) {
                Stats stats = group.get(team);
                rows.add(new Row(team, names.getOrDefault(team, "Equipe"), rank, stats.played, stats.wins, stats.draws,
                        stats.losses, stats.scored, stats.conceded, stats.scored - stats.conceded, stats.points,
                        qualified));
            }
            rank += bucket.size();
        }
        return new Table(label, rows);
    }

    private static String groupName(String location) {
        int start = location.lastIndexOf("(Grupo ");
        return start >= 0 && location.endsWith(")")
                ? location.substring(start + 1, location.length() - 1)
                : "Fase de grupos";
    }

    private SportsStandings() {
    }
}

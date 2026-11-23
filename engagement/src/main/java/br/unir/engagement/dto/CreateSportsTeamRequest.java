package br.unir.engagement.dto;

import java.util.List;

public record CreateSportsTeamRequest(String name, String captainName, List<String> memberNames,
        Integer reservedPlayerCount) {

    public CreateSportsTeamRequest(String name, String captainName, List<String> memberNames) {
        this(name, captainName, memberNames, null);
    }

    public CreateSportsTeamRequest {
        memberNames = memberNames == null ? List.of() : List.copyOf(memberNames);
    }
}

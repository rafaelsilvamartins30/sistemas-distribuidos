package br.unir.engagement.dto;

import java.util.UUID;

public record CreateSportRequest(String name, Integer playersOnField, Integer minimumRoster, Integer maximumRoster,
        Boolean allowsDraw, Integer winPoints, Integer drawPoints, Integer lossPoints, Integer defaultForfeitScore,
        String rulesMarkdown, String createdByType, UUID createdById) {
}

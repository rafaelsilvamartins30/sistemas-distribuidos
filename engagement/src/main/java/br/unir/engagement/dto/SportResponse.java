package br.unir.engagement.dto;

import br.unir.engagement.entity.Sport;
import java.util.UUID;

public record SportResponse(UUID id, String name, int playersOnField, int minimumRoster, int maximumRoster,
        boolean allowsDraw, int winPoints, int drawPoints, int lossPoints, int defaultForfeitScore,
        String rulesMarkdown, String createdByType, UUID createdById, String status) {

    public static SportResponse from(Sport sport) {
        return new SportResponse(sport.getId(), sport.getName(), sport.getPlayersOnField(), sport.getMinimumRoster(),
                sport.getMaximumRoster(), sport.isAllowsDraw(), sport.getWinPoints(), sport.getDrawPoints(),
                sport.getLossPoints(), sport.getDefaultForfeitScore(), sport.getRulesMarkdown(),
                sport.getCreatedByType(), sport.getCreatedById(), sport.getStatus());
    }
}

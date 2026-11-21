package br.unir.engagement.dto;

import java.util.UUID;

public record SportsMatchCheckInTokenResponse(UUID matchId, String checkinToken) {
}

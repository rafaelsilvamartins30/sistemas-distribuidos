package br.unir.engagement.dto;

import java.util.UUID;

public record SportsFreeAgentRegistrationResponse(String status, UUID teamId, String teamName) {
}

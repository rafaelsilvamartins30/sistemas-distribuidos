package br.unir.engagement.dto;

import java.util.UUID;

public record EventOrganizerContext(String organizerType, UUID organizerId, String name) {
}

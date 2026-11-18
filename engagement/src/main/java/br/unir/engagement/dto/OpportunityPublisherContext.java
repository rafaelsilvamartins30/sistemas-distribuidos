package br.unir.engagement.dto;

import java.util.UUID;

public record OpportunityPublisherContext(String publisherType, UUID publisherId, String name) {
}

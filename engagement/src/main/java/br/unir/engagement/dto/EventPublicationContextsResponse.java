package br.unir.engagement.dto;

import br.unir.engagement.entity.RegistrationMode;
import java.util.List;
import java.util.UUID;

public record EventPublicationContextsResponse(List<Context> items) {

    public EventPublicationContextsResponse {
        items = List.copyOf(items);
    }

    public record Context(String organizerType, UUID organizerId, String name, RegistrationMode paidRegistrationMode) {
    }
}

package br.unir.engagement.dto;

import static org.assertj.core.api.Assertions.assertThat;

import br.unir.engagement.entity.AttendanceMode;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.EventView;
import br.unir.engagement.entity.RegistrationMode;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EventResponseHateoasTest {

    @Test
    void activeInternalPaidEventWithAttendanceIncludesContextualHateoasLinks() {
        UUID eventId = UUID.randomUUID();
        EventView view = new EventView(eventId.toString(), 1L, "Simpósio UNIR", "Descrição", "DEPARTMENT",
                UUID.randomUUID().toString(), "user-1", null, "Auditório", Instant.now().plusSeconds(7200),
                Instant.now().plusSeconds(10800), "TECH", 100, Instant.now().plusSeconds(3600),
                RegistrationMode.INTERNAL_PAID, 2500L, null, true, AttendanceMode.ORGANIZER_SCANS_PARTICIPANT,
                EventStatus.ACTIVE, Instant.now());

        EventResponse response = EventResponse.from(view, true);

        assertThat(response.links()).containsOnlyKeys("self", "collection", "update", "cancel", "register");
        assertThat(EventResponse.from(view).links()).containsOnlyKeys("self", "collection", "register");
        assertThat(response.links().get("self")).isEqualTo(new HateoasLink("/api/v1/events/" + eventId, "GET"));
        assertThat(response.links().get("register"))
                .isEqualTo(new HateoasLink("/api/v1/events/" + eventId + "/registrations", "POST"));
    }

    @Test
    void cancelledEventOmitsStateTransitionLinks() {
        UUID eventId = UUID.randomUUID();
        EventView view = new EventView(eventId.toString(), 2L, "Evento Cancelado", "Descrição", "DEPARTMENT",
                UUID.randomUUID().toString(), "user-1", null, "Auditório", Instant.now().plusSeconds(7200),
                Instant.now().plusSeconds(10800), "TECH", 100, Instant.now().plusSeconds(3600),
                RegistrationMode.INTERNAL_FREE, null, null, false, null, EventStatus.CANCELLED, Instant.now());

        EventResponse response = EventResponse.from(view);

        assertThat(response.links()).containsOnlyKeys("self", "collection");
    }
}

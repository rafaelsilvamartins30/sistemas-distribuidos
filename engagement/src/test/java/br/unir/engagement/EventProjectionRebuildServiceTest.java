package br.unir.engagement;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.unir.engagement.dto.EventProjectionPayload;
import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.service.EventProjectionRebuildService;
import br.unir.engagement.service.EventProjectionStore;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;

class EventProjectionRebuildServiceTest {

    private final EventRepository eventRepository = mock(EventRepository.class);
    private final EventProjectionStore projectionStore = mock(EventProjectionStore.class);

    @Test
    void reprojectsEveryPostgresEventWithoutRewritingEventState() {
        Instant startsAt = Instant.parse("2027-06-15T17:00:00Z");
        Event active = event("Ativo", EventStatus.ACTIVE, startsAt);
        Event cancelled = event("Cancelado", EventStatus.CANCELLED, startsAt.plusSeconds(86_400));
        when(this.eventRepository.findAll(any(Sort.class))).thenReturn(List.of(active, cancelled));

        int rebuilt = new EventProjectionRebuildService(this.eventRepository, this.projectionStore).rebuild();

        org.junit.jupiter.api.Assertions.assertEquals(2, rebuilt);
        verify(this.projectionStore).apply(EventProjectionPayload.from(active));
        verify(this.projectionStore).apply(EventProjectionPayload.from(cancelled));
    }

    private static Event event(String title, EventStatus status, Instant startsAt) {
        return new Event(UUID.randomUUID(), title, "Descrição", "UNIVERSITY", UUID.randomUUID(), null, "Auditório",
                startsAt, startsAt.plusSeconds(3600), "ACADEMIC", 20, startsAt.minusSeconds(60),
                RegistrationMode.INTERNAL_FREE, null, null, false, null, status, Instant.parse("2027-01-01T12:00:00Z"));
    }
}

package br.unir.engagement.service;

import br.unir.engagement.dto.EventProjectionPayload;
import br.unir.engagement.entity.Event;
import br.unir.engagement.repository.EventRepository;
import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EventProjectionRebuildService {

    private final EventRepository eventRepository;
    private final EventProjectionStore projectionStore;

    public EventProjectionRebuildService(EventRepository eventRepository, EventProjectionStore projectionStore) {
        this.eventRepository = eventRepository;
        this.projectionStore = projectionStore;
    }

    @Transactional(readOnly = true)
    public int rebuild() {
        List<Event> events = this.eventRepository.findAll(Sort.by(Sort.Direction.ASC, "id"));
        for (Event event : events) {
            this.projectionStore.apply(EventProjectionPayload.from(event));
        }
        return events.size();
    }
}

package br.unir.engagement.service;

import br.unir.engagement.dto.EventListResponse;
import br.unir.engagement.dto.EventResponse;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.repository.EventRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EventService {

    private static final int MAX_PAGE_SIZE = 100;

    private final EventRepository eventRepository;

    public EventService(EventRepository eventRepository) {
        this.eventRepository = eventRepository;
    }

    public EventListResponse listEvents(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "page must be non-negative and size must be between 1 and 100");
        }
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "startsAt"));
        var result = this.eventRepository
                .findDiscoverableEvents(EventStatus.ACTIVE, RegistrationMode.EXTERNAL_PAID, Instant.now(), pageable)
                .map(EventResponse::from);
        return EventListResponse.from(result);
    }

    public EventResponse getEvent(UUID id) {
        return this.eventRepository.findById(id).map(EventResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
    }
}

package br.unir.engagement.controller;

import br.unir.engagement.dto.CreateEventRequest;
import br.unir.engagement.dto.EventListResponse;
import br.unir.engagement.dto.EventOrganizerContextsResponse;
import br.unir.engagement.dto.EventResponse;
import br.unir.engagement.dto.UpdateEventRequest;
import br.unir.engagement.service.EventService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events")
public class EventController {

    private final EventService eventService;

    public EventController(EventService eventService) {
        this.eventService = eventService;
    }

    @GetMapping
    public EventListResponse listEvents(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return this.eventService.listEvents(page, size);
    }

    @GetMapping("/organizer-contexts")
    public EventOrganizerContextsResponse organizerContexts(@AuthenticationPrincipal Jwt jwt) {
        return this.eventService.getOrganizerContexts(jwt.getTokenValue());
    }

    @GetMapping("/managed")
    public EventListResponse listManagedEvents(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @AuthenticationPrincipal Jwt jwt) {
        return this.eventService.listManagedEvents(page, size, jwt.getTokenValue());
    }

    @GetMapping("/{eventId}")
    public EventResponse getEvent(@PathVariable UUID eventId) {
        return this.eventService.getEvent(eventId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EventResponse createEvent(@Valid @RequestBody CreateEventRequest request, @AuthenticationPrincipal Jwt jwt) {
        return this.eventService.createEvent(request, jwt.getTokenValue(), jwt.getSubject());
    }

    @PatchMapping("/{eventId}")
    public EventResponse updateEvent(@PathVariable UUID eventId, @Valid @RequestBody UpdateEventRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return this.eventService.updateEvent(eventId, request, jwt.getTokenValue());
    }

    @DeleteMapping("/{eventId}")
    public EventResponse cancelEvent(@PathVariable UUID eventId, @AuthenticationPrincipal Jwt jwt) {
        return this.eventService.cancelEvent(eventId, jwt.getTokenValue());
    }
}

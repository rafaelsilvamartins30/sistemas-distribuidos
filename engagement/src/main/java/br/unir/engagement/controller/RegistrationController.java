package br.unir.engagement.controller;

import br.unir.engagement.dto.RegistrationListResponse;
import br.unir.engagement.dto.RegistrationResponse;
import br.unir.engagement.service.RegistrationService;
import java.net.URI;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class RegistrationController {

    private final RegistrationService registrationService;

    public RegistrationController(RegistrationService registrationService) {
        this.registrationService = registrationService;
    }

    @PostMapping("/events/{eventId}/registrations")
    public ResponseEntity<RegistrationResponse> register(@PathVariable UUID eventId, @AuthenticationPrincipal Jwt jwt) {
        RegistrationResponse registration = this.registrationService.register(eventId, subject(jwt));
        return ResponseEntity.created(URI.create("/api/v1/registrations/" + registration.id())).body(registration);
    }

    @GetMapping("/registrations/me")
    public RegistrationListResponse listMine(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID eventId, @RequestParam(required = false) LocalDate startOn,
            @RequestParam(required = false) LocalDate endOn, @RequestParam(required = false) String agenda) {
        return this.registrationService.listForUser(subject(jwt), page, size, eventId, startOn, endOn, agenda);
    }

    @DeleteMapping("/registrations/{registrationId}")
    public RegistrationResponse cancel(@PathVariable UUID registrationId, @AuthenticationPrincipal Jwt jwt) {
        return this.registrationService.cancel(registrationId, subject(jwt));
    }

    private static String subject(Jwt jwt) {
        String subject = jwt == null ? null : jwt.getSubject();
        if (subject == null || subject.isBlank() || subject.length() > 255) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "A valid Keycloak subject is required");
        }
        return subject;
    }
}

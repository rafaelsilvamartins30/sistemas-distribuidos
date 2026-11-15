package br.unir.engagement.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import br.unir.engagement.dto.HealthResponse;
import br.unir.engagement.service.EngagementHealthService;

@RestController
public class EngagementHealthController {

    private final EngagementHealthService healthService;

    public EngagementHealthController(EngagementHealthService healthService) {
        this.healthService = healthService;
    }

    @GetMapping("/health")
    public HealthResponse health() {
        return this.healthService.checkHealth();
    }
}

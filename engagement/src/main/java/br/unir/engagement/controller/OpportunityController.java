package br.unir.engagement.controller;

import br.unir.engagement.dto.CreateOpportunityRequest;
import br.unir.engagement.dto.OpportunityListResponse;
import br.unir.engagement.dto.OpportunityPublisherContextsResponse;
import br.unir.engagement.dto.OpportunityResponse;
import br.unir.engagement.service.OpportunityService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/v1/opportunities")
public class OpportunityController {

    private final OpportunityService opportunityService;

    public OpportunityController(OpportunityService opportunityService) {
        this.opportunityService = opportunityService;
    }

    @GetMapping
    public OpportunityListResponse listOpportunities(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @RequestParam(required = false) String q,
            @RequestParam(required = false) String category, @RequestParam(required = false) String publisherType) {
        return this.opportunityService.listOpportunities(page, size, q, category, publisherType);
    }

    @GetMapping("/{opportunityId}")
    public OpportunityResponse getOpportunity(@PathVariable UUID opportunityId) {
        return this.opportunityService.getOpportunity(opportunityId);
    }

    @GetMapping("/publisher-contexts")
    public OpportunityPublisherContextsResponse publisherContexts(@AuthenticationPrincipal Jwt jwt) {
        return this.opportunityService.getPublisherContexts(jwt.getTokenValue());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OpportunityResponse createOpportunity(@Valid @RequestBody CreateOpportunityRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return this.opportunityService.createOpportunity(request, jwt.getTokenValue());
    }
}

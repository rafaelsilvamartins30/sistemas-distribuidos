package br.unir.engagement.service;

import br.unir.engagement.client.CampusOpportunityPublisherClient;
import br.unir.engagement.dto.CreateOpportunityRequest;
import br.unir.engagement.dto.OpportunityListResponse;
import br.unir.engagement.dto.OpportunityPublisherContext;
import br.unir.engagement.dto.OpportunityPublisherContextsResponse;
import br.unir.engagement.dto.OpportunityResponse;
import br.unir.engagement.entity.Opportunity;
import br.unir.engagement.repository.OpportunityRepository;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.Locale;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OpportunityService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<String> PUBLISHER_TYPES = Set.of("PROFESSOR", "DEPARTMENT", "ACADEMIC_ENTITY");

    private final OpportunityRepository opportunityRepository;
    private final CampusOpportunityPublisherClient campusPublisherClient;

    public OpportunityService(OpportunityRepository opportunityRepository,
            CampusOpportunityPublisherClient campusPublisherClient) {
        this.opportunityRepository = opportunityRepository;
        this.campusPublisherClient = campusPublisherClient;
    }

    public OpportunityListResponse listOpportunities(int page, int size, String query, String category,
            String publisherType) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "page must be non-negative and size must be between 1 and 100");
        }

        String normalizedPublisherType = normalizePublisherType(publisherType);
        var pageable = PageRequest.of(page, size,
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.ASC, "id")));
        var result = this.opportunityRepository.findActive(Opportunity.activeStatus(), Instant.now(), normalize(query),
                normalize(category), normalizedPublisherType, pageable).map(OpportunityResponse::from);
        return OpportunityListResponse.from(result);
    }

    public OpportunityResponse getOpportunity(UUID id) {
        return this.opportunityRepository.findById(id).map(OpportunityResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Opportunity not found"));
    }

    public OpportunityPublisherContextsResponse getPublisherContexts(String bearerToken) {
        return this.campusPublisherClient.getContexts(bearerToken);
    }

    public OpportunityResponse createOpportunity(CreateOpportunityRequest request, String bearerToken) {
        String publisherType = request.publisherType();
        if ("COMMUNITY".equals(publisherType)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "COMMUNITY cannot publish opportunities");
        }
        if (!PUBLISHER_TYPES.contains(publisherType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "publisherType must be PROFESSOR, DEPARTMENT, or ACADEMIC_ENTITY");
        }
        Instant now = Instant.now();
        if (request.deadline() != null && !request.deadline().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "deadline must be in the future");
        }
        if (!isWebUrl(request.externalUrl()) || (request.imageUrl() != null && !isWebUrl(request.imageUrl()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URLs must use HTTP or HTTPS");
        }

        List<OpportunityPublisherContext> contexts = this.campusPublisherClient.getContexts(bearerToken).items();
        OpportunityPublisherContext verifiedPublisher = contexts.stream()
                .filter(context -> publisherType.equals(context.publisherType()))
                .filter(context -> request.publisherId().equals(context.publisherId())).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "The authenticated user is not authorized for this publisher"));

        Opportunity opportunity = new Opportunity(UUID.randomUUID(), request.title().trim(),
                request.description().trim(), verifiedPublisher.publisherType(), verifiedPublisher.publisherId(),
                request.category().trim(), request.deadline(), request.externalUrl().trim(),
                trimToNull(request.imageUrl()), now, Opportunity.activeStatus());
        return OpportunityResponse.from(this.opportunityRepository.saveAndFlush(opportunity));
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return value.trim();
    }

    private static String normalizePublisherType(String publisherType) {
        String normalized = normalize(publisherType);
        if (normalized.isEmpty()) {
            return normalized;
        }
        normalized = normalized.toUpperCase(Locale.ROOT);
        if (!PUBLISHER_TYPES.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "publisherType must be PROFESSOR, DEPARTMENT, or ACADEMIC_ENTITY");
        }
        return normalized;
    }

    private static boolean isWebUrl(String value) {
        try {
            URI uri = new URI(value.trim());
            return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                    && uri.getHost() != null;
        } catch (URISyntaxException exception) {
            return false;
        }
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

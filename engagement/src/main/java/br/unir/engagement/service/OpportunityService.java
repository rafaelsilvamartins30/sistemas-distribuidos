package br.unir.engagement.service;

import br.unir.engagement.client.CampusOpportunityPublisherClient;
import br.unir.engagement.dto.CreateOpportunityRequest;
import br.unir.engagement.dto.OpportunityListResponse;
import br.unir.engagement.dto.OpportunityPublisherContext;
import br.unir.engagement.dto.OpportunityPublisherContextsResponse;
import br.unir.engagement.dto.OpportunityResponse;
import br.unir.engagement.dto.UpdateOpportunityRequest;
import br.unir.engagement.entity.Opportunity;
import br.unir.engagement.repository.OpportunityRepository;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.util.Locale;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OpportunityService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<String> PUBLISHER_TYPES = Set.of("PROFESSOR", "DEPARTMENT", "ACADEMIC_ENTITY");
    private static final Set<String> ALLOWED_STATUSES = Set.of(Opportunity.activeStatus(), Opportunity.closedStatus());

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

    public OpportunityListResponse listManagedOpportunities(int page, int size, String bearerToken) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "page must be non-negative and size must be between 1 and 100");
        }
        List<OpportunityPublisherContext> contexts = this.campusPublisherClient.getContexts(bearerToken).items();
        Set<UUID> publisherIds = contexts.stream().map(OpportunityPublisherContext::publisherId)
                .collect(Collectors.toSet());
        if (publisherIds.isEmpty()) {
            return new OpportunityListResponse(List.of(), page, size, 0, 0);
        }
        var pageable = PageRequest.of(page, size,
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.ASC, "id")));
        var result = this.opportunityRepository.findByPublisherIdIn(publisherIds, pageable)
                .map(OpportunityResponse::from);
        return OpportunityListResponse.from(result);
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

    @Transactional
    public OpportunityResponse updateOpportunity(UUID id, UpdateOpportunityRequest request, String bearerToken) {
        Opportunity opportunity = this.opportunityRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Opportunity not found"));
        this.verifyPublisherAuthorization(opportunity, bearerToken);

        String title = request.title() == null
                ? opportunity.getTitle()
                : requireNonBlank(request.title(), "title must not be blank");
        String description = request.description() == null
                ? opportunity.getDescription()
                : requireNonBlank(request.description(), "description must not be blank");
        String category = request.category() == null
                ? opportunity.getCategory()
                : requireNonBlank(request.category(), "category must not be blank");
        String externalUrl = request.externalUrl() == null
                ? opportunity.getExternalUrl()
                : requireNonBlank(request.externalUrl(), "externalUrl must not be blank");
        if (!isWebUrl(externalUrl)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URLs must use HTTP or HTTPS");
        }

        String imageUrl = opportunity.getImageUrl();
        if (Boolean.TRUE.equals(request.clearImageUrl())) {
            imageUrl = null;
        } else if (request.imageUrl() != null) {
            imageUrl = trimToNull(request.imageUrl());
            if (imageUrl != null && !isWebUrl(imageUrl)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URLs must use HTTP or HTTPS");
            }
        }

        Instant now = Instant.now();
        Instant deadline = opportunity.getDeadline();
        if (Boolean.TRUE.equals(request.clearDeadline())) {
            deadline = null;
        } else if (request.deadline() != null) {
            if (!request.deadline().isAfter(now)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "deadline must be in the future");
            }
            deadline = request.deadline();
        }

        String status = opportunity.getStatus();
        if (request.status() != null) {
            String normalizedStatus = request.status().trim().toUpperCase(Locale.ROOT);
            if (!ALLOWED_STATUSES.contains(normalizedStatus)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be ACTIVE or CLOSED");
            }
            status = normalizedStatus;
        }
        if (Opportunity.activeStatus().equals(status) && deadline != null && !deadline.isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Active opportunity deadline must be in the future");
        }

        opportunity.updateDetails(title, description, category, deadline, externalUrl, imageUrl, status);
        return OpportunityResponse.from(this.opportunityRepository.saveAndFlush(opportunity));
    }

    @Transactional
    public OpportunityResponse closeOpportunity(UUID id, String bearerToken) {
        Opportunity opportunity = this.opportunityRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Opportunity not found"));
        this.verifyPublisherAuthorization(opportunity, bearerToken);
        opportunity.close();
        return OpportunityResponse.from(this.opportunityRepository.saveAndFlush(opportunity));
    }

    private void verifyPublisherAuthorization(Opportunity opportunity, String bearerToken) {
        List<OpportunityPublisherContext> contexts = this.campusPublisherClient.getContexts(bearerToken).items();
        boolean authorized = contexts.stream()
                .anyMatch(context -> opportunity.getPublisherType().equals(context.publisherType())
                        && opportunity.getPublisherId().equals(context.publisherId()));
        if (!authorized) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "The authenticated user is not authorized for this publisher");
        }
    }

    private static String requireNonBlank(String value, String message) {
        String trimmed = normalize(value);
        if (trimmed.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return trimmed;
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

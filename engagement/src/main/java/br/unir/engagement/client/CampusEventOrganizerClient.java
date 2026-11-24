package br.unir.engagement.client;

import br.unir.engagement.dto.EventOrganizerContextsResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

/**
 * Resolves the caller's authorized event organizer contexts from Campus using
 * the original bearer token.
 */
@Component
public class CampusEventOrganizerClient {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(1);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(2);

    private final RestClient restClient;

    public CampusEventOrganizerClient(RestClient.Builder restClientBuilder,
            @Value("${campus.url:http://localhost:3000}") String campusUrl) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = restClientBuilder.requestFactory(requestFactory).baseUrl(campusUrl).build();
    }

    public boolean containsAcademicSchedule(LocalDate first, LocalDate last, String bearerToken) {
        try {
            for (int page = 0;; page++) {
                final int currentPage = page;
                SemesterPage result = this.restClient.get()
                        .uri(uri -> uri.path("/semesters").queryParam("page", currentPage).queryParam("size", 100)
                                .build())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken).retrieve().body(SemesterPage.class);
                if (result == null || result.items() == null) {
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                            "Campus returned no semester catalog");
                }
                if (result.items().stream().anyMatch(term -> term.startOn() != null && term.endOn() != null
                        && !first.isBefore(term.startOn()) && !last.isAfter(term.endOn()))) {
                    return true;
                }
                if (page + 1 >= result.totalPages()) {
                    return false;
                }
            }
        } catch (RestClientException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Não foi possível consultar os semestres do Campus.", exception);
        }
    }

    private record SemesterPage(List<SemesterDates> items, int page, int size, long totalElements, int totalPages) {
    }

    private record SemesterDates(String id, String name, LocalDate startOn, LocalDate endOn) {
    }

    public EventOrganizerContextsResponse getContexts(String bearerToken) {
        try {
            EventOrganizerContextsResponse response = this.restClient.get().uri("/internal/v1/event-organizers")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken).retrieve()
                    .onStatus(status -> status.value() == 401, (request, responseBody) -> {
                        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user token for Campus");
                    }).onStatus(status -> status.value() == 403, (request, responseBody) -> {
                        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Campus denied the permission query");
                    }).body(EventOrganizerContextsResponse.class);
            if (response == null || response.items() == null) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Campus returned an invalid response");
            }
            return response;
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Campus is unavailable", exception);
        }
    }
}

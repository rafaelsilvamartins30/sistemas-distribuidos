package br.unir.engagement.service;

import br.unir.engagement.dto.CompetitionListResponse;
import br.unir.engagement.dto.CompetitionResponse;
import br.unir.engagement.dto.SeasonListResponse;
import br.unir.engagement.dto.SeasonResponse;
import br.unir.engagement.dto.SportListResponse;
import br.unir.engagement.dto.SportResponse;
import br.unir.engagement.repository.CompetitionRepository;
import br.unir.engagement.repository.SeasonRepository;
import br.unir.engagement.repository.SportRepository;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SportsCatalogService {

    private static final int MAX_PAGE_SIZE = 100;

    private final SportRepository sportRepository;
    private final CompetitionRepository competitionRepository;
    private final SeasonRepository seasonRepository;

    public SportsCatalogService(SportRepository sportRepository, CompetitionRepository competitionRepository,
            SeasonRepository seasonRepository) {
        this.sportRepository = sportRepository;
        this.competitionRepository = competitionRepository;
        this.seasonRepository = seasonRepository;
    }

    public SportListResponse listSports(int page, int size, String query) {
        var pageable = pageRequest(page, size, "name");
        return SportListResponse.from(this.sportRepository.search(normalize(query), pageable).map(SportResponse::from));
    }

    public SportResponse getSport(UUID id) {
        return this.sportRepository.findById(id).map(SportResponse::from).orElseThrow(() -> notFound("Sport"));
    }

    public CompetitionListResponse listCompetitions(int page, int size, String query, UUID sportId, String skillLevel,
            String organizerType, UUID organizerId, Integer targetTeamCount) {
        validateTeamCount(targetTeamCount, 16, 32);
        var pageable = pageRequest(page, size, "title");
        return CompetitionListResponse.from(this.competitionRepository.search(normalize(query), sportId,
                normalize(skillLevel), normalize(organizerType), organizerId, targetTeamCount, pageable)
                .map(CompetitionResponse::from));
    }

    public CompetitionResponse getCompetition(UUID id) {
        return this.competitionRepository.findById(id).map(CompetitionResponse::from)
                .orElseThrow(() -> notFound("Competition"));
    }

    public SeasonListResponse listSeasons(int page, int size, String query, UUID sportId, String skillLevel,
            String organizerType, UUID organizerId, Integer targetTeamCount) {
        validateTeamCount(targetTeamCount, 10, 20);
        var pageable = pageRequest(page, size, "title");
        return SeasonListResponse.from(this.seasonRepository.search(normalize(query), sportId, normalize(skillLevel),
                normalize(organizerType), organizerId, targetTeamCount, pageable).map(SeasonResponse::from));
    }

    public SeasonResponse getSeason(UUID id) {
        return this.seasonRepository.findById(id).map(SeasonResponse::from).orElseThrow(() -> notFound("Season"));
    }

    private static org.springframework.data.domain.Pageable pageRequest(int page, int size, String sortField) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "page must be non-negative and size must be between 1 and 100");
        }
        return PageRequest.of(page, size,
                Sort.by(Sort.Direction.ASC, sortField).and(Sort.by(Sort.Direction.ASC, "id")));
    }

    private static void validateTeamCount(Integer count, int first, int second) {
        if (count != null && count != first && count != second) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "targetTeamCount must be " + first + " or " + second);
        }
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private static ResponseStatusException notFound(String resource) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, resource + " not found");
    }
}

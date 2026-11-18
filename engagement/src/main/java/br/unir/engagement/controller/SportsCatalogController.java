package br.unir.engagement.controller;

import br.unir.engagement.dto.CompetitionListResponse;
import br.unir.engagement.dto.CompetitionResponse;
import br.unir.engagement.dto.SeasonListResponse;
import br.unir.engagement.dto.SeasonResponse;
import br.unir.engagement.dto.SportListResponse;
import br.unir.engagement.dto.SportResponse;
import br.unir.engagement.service.SportsCatalogService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class SportsCatalogController {

    private final SportsCatalogService sportsCatalogService;

    public SportsCatalogController(SportsCatalogService sportsCatalogService) {
        this.sportsCatalogService = sportsCatalogService;
    }

    @GetMapping("/sports")
    public SportListResponse listSports(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @RequestParam(required = false) String q) {
        return this.sportsCatalogService.listSports(page, size, q);
    }

    @GetMapping("/sports/{sportId}")
    public SportResponse getSport(@PathVariable UUID sportId) {
        return this.sportsCatalogService.getSport(sportId);
    }

    @GetMapping("/competitions")
    public CompetitionListResponse listCompetitions(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID sportId, @RequestParam(required = false) String skillLevel,
            @RequestParam(required = false) String organizerType, @RequestParam(required = false) UUID organizerId,
            @RequestParam(required = false) Integer targetTeamCount) {
        return this.sportsCatalogService.listCompetitions(page, size, q, sportId, skillLevel, organizerType,
                organizerId, targetTeamCount);
    }

    @GetMapping("/competitions/{competitionId}")
    public CompetitionResponse getCompetition(@PathVariable UUID competitionId) {
        return this.sportsCatalogService.getCompetition(competitionId);
    }

    @GetMapping("/seasons")
    public SeasonListResponse listSeasons(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID sportId, @RequestParam(required = false) String skillLevel,
            @RequestParam(required = false) String organizerType, @RequestParam(required = false) UUID organizerId,
            @RequestParam(required = false) Integer targetTeamCount) {
        return this.sportsCatalogService.listSeasons(page, size, q, sportId, skillLevel, organizerType, organizerId,
                targetTeamCount);
    }

    @GetMapping("/seasons/{seasonId}")
    public SeasonResponse getSeason(@PathVariable UUID seasonId) {
        return this.sportsCatalogService.getSeason(seasonId);
    }
}

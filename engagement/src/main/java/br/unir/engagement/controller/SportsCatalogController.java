package br.unir.engagement.controller;

import br.unir.engagement.dto.CompetitionListResponse;
import br.unir.engagement.dto.CompetitionResponse;
import br.unir.engagement.dto.CreateCompetitionRequest;
import br.unir.engagement.dto.CreateSeasonRequest;
import br.unir.engagement.dto.CreateSportRequest;
import br.unir.engagement.dto.CreateSportsTeamRequest;
import br.unir.engagement.dto.EventOrganizerContextsResponse;
import br.unir.engagement.dto.GenerateSportsMatchesRequest;
import br.unir.engagement.dto.JoinSportsTeamRequest;
import br.unir.engagement.dto.MySportsEnrollmentsResponse;
import br.unir.engagement.dto.MySportsMatchesResponse;
import br.unir.engagement.dto.PaymentReferenceResponse;
import br.unir.engagement.dto.RecordSportsMatchScoreRequest;
import br.unir.engagement.dto.RegisterFreeAgentRequest;
import br.unir.engagement.dto.SeasonListResponse;
import br.unir.engagement.dto.SeasonResponse;
import br.unir.engagement.dto.SportListResponse;
import br.unir.engagement.dto.SportResponse;
import br.unir.engagement.dto.SportsEventOverviewResponse;
import br.unir.engagement.dto.SportsFreeAgentRegistrationResponse;
import br.unir.engagement.dto.SportsMatchCheckInRequest;
import br.unir.engagement.dto.SportsMatchCheckInResponse;
import br.unir.engagement.dto.SportsMatchCheckInTokenResponse;
import br.unir.engagement.dto.SportsMatchResponse;
import br.unir.engagement.dto.SportsTeamResponse;
import br.unir.engagement.dto.UpdateSportsEventRequest;
import br.unir.engagement.service.SportsCatalogService;
import br.unir.engagement.service.RegistrationService;
import br.unir.engagement.service.SportsParticipationService;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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
@RequestMapping("/api/v1")
public class SportsCatalogController {

    private final SportsCatalogService sportsCatalogService;
    private final SportsParticipationService participationService;
    private final RegistrationService registrationService;

    @SuppressFBWarnings(value = "EI_EXPOSE_REP2", justification = "Spring injects container-managed service beans")
    public SportsCatalogController(SportsCatalogService sportsCatalogService,
            SportsParticipationService participationService, RegistrationService registrationService) {
        this.sportsCatalogService = sportsCatalogService;
        this.participationService = participationService;
        this.registrationService = registrationService;
    }

    @GetMapping("/sports")
    public SportListResponse listSports(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @RequestParam(required = false) String q) {
        return this.sportsCatalogService.listSports(page, size, q);
    }

    @GetMapping("/sports/organizer-contexts")
    public EventOrganizerContextsResponse organizerContexts(@AuthenticationPrincipal Jwt jwt) {
        return this.participationService.getOrganizerContexts(jwt.getTokenValue());
    }

    @PostMapping("/sports")
    @ResponseStatus(HttpStatus.CREATED)
    public SportResponse createSport(@RequestBody CreateSportRequest request, @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.createSport(request, jwt.getTokenValue());
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

    @PostMapping("/competitions")
    @ResponseStatus(HttpStatus.CREATED)
    public CompetitionResponse createCompetition(@RequestBody CreateCompetitionRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.createCompetition(request, jwt.getTokenValue());
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

    @PostMapping("/seasons")
    @ResponseStatus(HttpStatus.CREATED)
    public SeasonResponse createSeason(@RequestBody CreateSeasonRequest request, @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.createSeason(request, jwt.getTokenValue());
    }

    @GetMapping("/seasons/{seasonId}")
    public SeasonResponse getSeason(@PathVariable UUID seasonId) {
        return this.sportsCatalogService.getSeason(seasonId);
    }

    @GetMapping("/sports-events/{contextType}/{contextId}/overview")
    public SportsEventOverviewResponse getEventOverview(@PathVariable String contextType, @PathVariable UUID contextId,
            @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.getOverview(contextType, contextId, jwt.getSubject(), jwt.getTokenValue());
    }

    @PatchMapping("/sports-events/{contextType}/{contextId}")
    public Map<String, Object> updateSportsEvent(@PathVariable String contextType, @PathVariable UUID contextId,
            @RequestBody UpdateSportsEventRequest request, @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.updateSportsEvent(contextType, contextId, request, jwt.getTokenValue());
    }

    @PostMapping("/sports-events/{contextType}/{contextId}/cancel")
    public Map<String, Object> cancelSportsEvent(@PathVariable String contextType, @PathVariable UUID contextId,
            @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.cancelSportsEvent(contextType, contextId, jwt.getTokenValue());
    }

    @PostMapping("/sports-events/{contextType}/{contextId}/teams")
    @ResponseStatus(HttpStatus.CREATED)
    public SportsTeamResponse registerTeam(@PathVariable String contextType, @PathVariable UUID contextId,
            @RequestBody CreateSportsTeamRequest request, @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.registerTeam(contextType, contextId, request, jwt.getSubject(),
                defaultDisplayName(jwt));
    }

    @PostMapping("/sports-events/{contextType}/{contextId}/teams/join")
    @ResponseStatus(HttpStatus.CREATED)
    public SportsTeamResponse joinTeamByInviteCode(@PathVariable String contextType, @PathVariable UUID contextId,
            @RequestBody JoinSportsTeamRequest request, @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.joinTeamByInviteCode(contextType, contextId, request, jwt.getSubject(),
                defaultDisplayName(jwt));
    }

    @PostMapping("/sports-events/{contextType}/{contextId}/free-agents")
    @ResponseStatus(HttpStatus.CREATED)
    public SportsFreeAgentRegistrationResponse registerFreeAgent(@PathVariable String contextType,
            @PathVariable UUID contextId, @RequestBody(required = false) RegisterFreeAgentRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.registerFreeAgent(contextType, contextId, request, jwt.getSubject(),
                defaultDisplayName(jwt));
    }

    @PostMapping("/sports-events/{contextType}/{contextId}/matches/generate")
    @ResponseStatus(HttpStatus.CREATED)
    public List<SportsMatchResponse> generateMatches(@PathVariable String contextType, @PathVariable UUID contextId,
            @RequestBody(required = false) GenerateSportsMatchesRequest request, @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.generateMatches(contextType, contextId, request, jwt.getSubject(),
                jwt.getTokenValue());
    }

    @PatchMapping("/sports-matches/{matchId}/score")
    public SportsMatchResponse recordScore(@PathVariable UUID matchId,
            @RequestBody RecordSportsMatchScoreRequest request, @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.recordScore(matchId, request, jwt.getSubject(), jwt.getTokenValue());
    }

    @PostMapping("/sports-matches/{matchId}/checkin-token")
    public SportsMatchCheckInTokenResponse generateCheckInToken(@PathVariable UUID matchId,
            @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.generateCheckInToken(matchId, jwt.getTokenValue());
    }

    @PostMapping("/sports-matches/{matchId}/checkins")
    @ResponseStatus(HttpStatus.CREATED)
    public SportsMatchCheckInResponse checkIn(@PathVariable UUID matchId,
            @RequestBody SportsMatchCheckInRequest request, @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.checkIn(matchId, request, jwt.getSubject());
    }

    @GetMapping("/sports-matches/{id}/attendance")
    public SportsParticipationService.MatchAttendance matchAttendance(@PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.matchAttendance(id, jwt.getTokenValue(), false);
    }

    @PostMapping("/sports-matches/{id}/attendance")
    public SportsParticipationService.MatchAttendance closeMatchAttendance(@PathVariable UUID id,
            @AuthenticationPrincipal Jwt jwt) {
        return this.participationService.matchAttendance(id, jwt.getTokenValue(), true);
    }

    @GetMapping("/sports-payment-origins/me")
    public Map<UUID, String> mySportsPaymentOrigins(@AuthenticationPrincipal Jwt jwt) {
        var origins = this.participationService.getMySportsPaymentOrigins(jwt.getSubject());
        this.registrationService.getMyPaymentReferences(jwt.getSubject()).forEach(id -> origins.put(id, "EVENT"));
        return origins;
    }

    @GetMapping("/payment-references/me")
    public Map<UUID, PaymentReferenceResponse> myPaymentReferences(@AuthenticationPrincipal Jwt jwt) {
        var references = this.participationService.getMySportsPaymentReferences(jwt.getSubject());
        references.putAll(this.registrationService.getMyPaymentReferenceDetails(jwt.getSubject()));
        return references;
    }

    @GetMapping("/sports-events/me")
    public MySportsEnrollmentsResponse myEnrollments(@AuthenticationPrincipal Jwt jwt) {
        return this.participationService.getMyEnrollments(jwt.getSubject());
    }

    @GetMapping("/sports-matches/me")
    public MySportsMatchesResponse myMatches(@AuthenticationPrincipal Jwt jwt) {
        return this.participationService.getMyMatches(jwt.getSubject());
    }

    private static String defaultDisplayName(Jwt jwt) {
        String name = jwt.getClaimAsString("name");
        if (name != null && !name.isBlank()) {
            return name;
        }
        String username = jwt.getClaimAsString("preferred_username");
        if (username != null && !username.isBlank()) {
            return username;
        }
        return jwt.getSubject();
    }
}

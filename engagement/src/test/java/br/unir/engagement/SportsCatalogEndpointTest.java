package br.unir.engagement;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.unir.engagement.client.CampusEventOrganizerClient;
import br.unir.engagement.dto.EventOrganizerContext;
import br.unir.engagement.dto.EventOrganizerContextsResponse;
import br.unir.engagement.entity.Competition;
import br.unir.engagement.entity.Season;
import br.unir.engagement.entity.Sport;
import br.unir.engagement.repository.CompetitionRepository;
import br.unir.engagement.repository.SeasonRepository;
import br.unir.engagement.repository.SportRepository;
import br.unir.engagement.service.EventProjectionStore;
import br.unir.engagement.service.PaymentConfirmationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
class SportsCatalogEndpointTest {

    @MockitoBean
    private EventProjectionStore eventProjectionStore;

    @MockitoBean
    private CampusEventOrganizerClient campusEventOrganizerClient;

    private static final UUID SPORT_ID = UUID.fromString("40000000-0000-4000-8000-000000000001");
    private static final UUID ORGANIZER_ID = UUID.fromString("40000000-0000-4000-8000-000000000002");
    private static final UUID COMMUNITY_ID = UUID.fromString("40000000-0000-4000-8000-000000000009");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private CompetitionRepository competitionRepository;

    @Autowired
    private SeasonRepository seasonRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PaymentConfirmationService paymentConfirmationService;

    @BeforeEach
    void clearSportsCatalog() {
        this.jdbcTemplate.update("DELETE FROM processed_payment_confirmations");
        this.jdbcTemplate.update("DELETE FROM outbox_events");
        this.jdbcTemplate.update("DELETE FROM sports_match_checkins");
        this.jdbcTemplate.update("DELETE FROM sports_matches");
        this.jdbcTemplate.update("DELETE FROM sports_free_agents");
        this.jdbcTemplate.update("DELETE FROM sports_team_members");
        this.jdbcTemplate.update("DELETE FROM seasons");
        this.jdbcTemplate.update("DELETE FROM sports_teams");
        this.jdbcTemplate.update("DELETE FROM competitions");
        this.jdbcTemplate.update("DELETE FROM sports");
        when(this.campusEventOrganizerClient.getContexts(anyString()))
                .thenReturn(new EventOrganizerContextsResponse(List.of()));
    }

    @Test
    void listsPersistedSportsAndCompetitionPagesWithModelFilters() throws Exception {
        Sport sport = sport(SPORT_ID, "Futsal");
        this.sportRepository.saveAndFlush(sport);
        Competition first = competition(UUID.randomUUID(), "Copa do Campus", sport, 16, "ACTIVE");
        Competition second = competition(UUID.randomUUID(), "Copa Universitária", sport, 32, "ARCHIVED");
        this.competitionRepository.saveAllAndFlush(List.of(first, second));

        this.mockMvc.perform(get("/api/v1/sports?page=0&size=1&q=fut").with(userJwt())).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(SPORT_ID.toString()))
                .andExpect(jsonPath("$.items[0].winPoints").value(3));

        this.mockMvc.perform(get("/api/v1/competitions?page=0&size=1").with(userJwt())).andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items[0].title").value("Copa do Campus"));

        this.mockMvc
                .perform(get("/api/v1/competitions?sportId=" + SPORT_ID
                        + "&skillLevel=competitive&organizerType=department&organizerId=" + ORGANIZER_ID
                        + "&targetTeamCount=32").with(userJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].title").value("Copa Universitária"))
                .andExpect(jsonPath("$.items[0].sportName").value("Futsal"))
                .andExpect(jsonPath("$.items[0].format").value("GROUPS_KNOCKOUT"))
                .andExpect(jsonPath("$.items[0].managerUserIds").doesNotExist());
    }

    @Test
    void retrievesSportCompetitionAndSeasonDetailsAndPreservesCatalogHistory() throws Exception {
        Sport sport = sport(SPORT_ID, "Vôlei");
        this.sportRepository.saveAndFlush(sport);
        Competition competition = competition(UUID.randomUUID(), "Copa Arquivada", sport, 16, "ARCHIVED");
        Season season = season(UUID.randomUUID(), "Liga de Turno e Returno", sport, 10);
        this.competitionRepository.saveAndFlush(competition);
        this.seasonRepository.saveAndFlush(season);

        this.mockMvc.perform(get("/api/v1/sports/{id}", SPORT_ID).with(userJwt())).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Vôlei")).andExpect(jsonPath("$.allowsDraw").value(true));
        this.mockMvc.perform(get("/api/v1/competitions/{id}", competition.getId()).with(userJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ARCHIVED"))
                .andExpect(jsonPath("$.sportName").value("Vôlei")).andExpect(jsonPath("$.tieBreakers").doesNotExist());
        this.mockMvc.perform(get("/api/v1/seasons/{id}", season.getId()).with(userJwt())).andExpect(status().isOk())
                .andExpect(jsonPath("$.targetTeamCount").value(10))
                .andExpect(jsonPath("$.roundRobinMode").value("double round-robin"))
                .andExpect(jsonPath("$.sportName").value("Vôlei"));
        this.mockMvc.perform(
                get("/api/v1/seasons?sportId=" + SPORT_ID + "&targetTeamCount=10&page=0&size=2").with(userJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        this.mockMvc.perform(get("/api/v1/seasons/{id}", UUID.randomUUID()).with(userJwt()))
                .andExpect(status().isNotFound());
    }

    @Test
    void catalogRequiresUserRoleValidatesPageAndFormatFiltersAndRejectsUnauthorizedWrites() throws Exception {
        this.mockMvc.perform(get("/api/v1/sports")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/sports").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_GUEST"))))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(get("/api/v1/sports").with(userJwt()).param("page", "-1"))
                .andExpect(status().isBadRequest());
        this.mockMvc.perform(get("/api/v1/competitions").with(userJwt()).param("size", "101"))
                .andExpect(status().isBadRequest());
        this.mockMvc.perform(get("/api/v1/competitions").with(userJwt()).param("targetTeamCount", "10"))
                .andExpect(status().isBadRequest());
        this.mockMvc.perform(get("/api/v1/seasons").with(userJwt()).param("targetTeamCount", "16"))
                .andExpect(status().isBadRequest());
        this.mockMvc.perform(post("/api/v1/sports").with(userJwt()).contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Handebol","playersOnField":7,"minimumRoster":7,"maximumRoster":14,
                 "allowsDraw":true,"winPoints":3,"drawPoints":1,"lossPoints":0,"defaultForfeitScore":3,
                 "rulesMarkdown":"Regras oficiais.","createdByType":"DEPARTMENT",
                 "createdById":"40000000-0000-4000-8000-000000000002"}
                """)).andExpect(status().isForbidden());
        this.mockMvc.perform(put("/api/v1/competitions/{id}", UUID.randomUUID()).with(userJwt()))
                .andExpect(status().isForbidden());
    }

    @Test
    void authorizedOrganizerCreatesSportsCompetitionsSeasonsAndRejectsCommunityContext() throws Exception {
        when(this.campusEventOrganizerClient.getContexts(anyString())).thenReturn(
                new EventOrganizerContextsResponse(List.of(new EventOrganizerContext("DEPARTMENT", ORGANIZER_ID, "DCC"),
                        new EventOrganizerContext("COMMUNITY", COMMUNITY_ID, "Clube Aberto"))));

        this.mockMvc.perform(get("/api/v1/sports/organizer-contexts").with(userJwt())).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].organizerType").value("DEPARTMENT"));

        MvcResult sportResult = this.mockMvc
                .perform(post("/api/v1/sports").with(userJwt()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"Basquete 3x3","playersOnField":3,"minimumRoster":3,"maximumRoster":5,
                         "allowsDraw":false,"winPoints":2,"drawPoints":0,"lossPoints":1,"defaultForfeitScore":21,
                         "rulesMarkdown":"Jogo até 21 pontos.","createdByType":"DEPARTMENT",
                         "createdById":"40000000-0000-4000-8000-000000000002"}
                        """)).andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Basquete 3x3"))
                .andReturn();
        String createdSportId = this.objectMapper.readTree(sportResult.getResponse().getContentAsString()).get("id")
                .asText();

        this.mockMvc.perform(post("/api/v1/sports").with(userJwt()).contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Xadrez","playersOnField":1,"minimumRoster":1,"maximumRoster":2,
                 "allowsDraw":true,"winPoints":1,"drawPoints":0,"lossPoints":0,"defaultForfeitScore":1,
                 "rulesMarkdown":"Regra.","createdByType":"COMMUNITY",
                 "createdById":"40000000-0000-4000-8000-000000000009"}
                """)).andExpect(status().isForbidden());

        this.mockMvc
                .perform(
                        post("/api/v1/competitions").with(userJwt()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"title":"Copa 3x3 UFLA","sportId":"%s","skillLevel":"COMPETITIVE",
                                 "organizerType":"DEPARTMENT","organizerId":"%s","targetTeamCount":32,
                                 "teamEntryPrice":5000,"freeAgentPrice":1000,
                                 "registrationDeadline":"2027-06-30T23:59:00Z"}
                                """.formatted(createdSportId, ORGANIZER_ID)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.title").value("Copa 3x3 UFLA"))
                .andExpect(jsonPath("$.format").value("GROUPS_KNOCKOUT"));

        this.mockMvc.perform(post("/api/v1/seasons").with(userJwt()).contentType(MediaType.APPLICATION_JSON).content("""
                {"title":"Liga 3x3 UFLA","sportId":"%s","skillLevel":"RECREATIONAL",
                 "organizerType":"DEPARTMENT","organizerId":"%s","targetTeamCount":10,
                 "teamEntryPrice":0,"freeAgentPrice":0,
                 "registrationDeadline":"2027-06-30T23:59:00Z"}
                """.formatted(createdSportId, ORGANIZER_ID))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.roundRobinMode").value("double round-robin"));
    }

    @Test
    void teamsFreeAgentAutoAllocationMatchesScoreAndCheckInFlowWorkEndToEnd() throws Exception {
        Sport sport = new Sport(SPORT_ID, "Futsal", 2, 2, 4, true, 3, 1, 0, 3, "Regras de teste.", "DEPARTMENT",
                ORGANIZER_ID, "ACTIVE");
        this.sportRepository.saveAndFlush(sport);
        Competition comp = new Competition(UUID.randomUUID(), "Copa Integração", sport, "COMPETITIVE", "DEPARTMENT",
                ORGANIZER_ID, 32, 2, 4, 0, 0, Instant.now().plusSeconds(86_400), "OPEN", "GROUPS_KNOCKOUT");
        this.competitionRepository.saveAndFlush(comp);

        when(this.campusEventOrganizerClient.getContexts("organizer-token"))
                .thenReturn(new EventOrganizerContextsResponse(
                        List.of(new EventOrganizerContext("DEPARTMENT", ORGANIZER_ID, "DCC"))));

        // Captain 1 registers Team Alpha with 2 players
        this.mockMvc
                .perform(post("/api/v1/sports-events/COMPETITION/{id}/teams", comp.getId())
                        .with(userJwt("captain-1", "Carlos")).contentType(MediaType.APPLICATION_JSON).content("""
                                {"name":"Time Alpha","memberNames":["João"]}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Time Alpha"))
                .andExpect(jsonPath("$.members.length()").value(2));

        // Captain 2 registers Team Beta with 1 player
        this.mockMvc
                .perform(post("/api/v1/sports-events/COMPETITION/{id}/teams", comp.getId())
                        .with(userJwt("captain-2", "Maria")).contentType(MediaType.APPLICATION_JSON).content("""
                                {"name":"Time Beta","memberNames":[]}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.members.length()").value(1));

        // Free agent is automatically allocated to Team Beta (fewest players)
        this.mockMvc
                .perform(post("/api/v1/sports-events/COMPETITION/{id}/free-agents", comp.getId())
                        .with(userJwt("free-1", "Lucas")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ALLOCATED"))
                .andExpect(jsonPath("$.teamName").value("Time Beta"));

        // Non-organizer cannot generate matches
        this.mockMvc.perform(post("/api/v1/sports-events/COMPETITION/{id}/matches/generate", comp.getId())
                .with(userJwt("captain-1", "Carlos"))).andExpect(status().isForbidden());

        this.mockMvc.perform(
                post("/api/v1/sports-events/COMPETITION/{id}/matches/generate", comp.getId()).with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"location\":\"Quadra 1 UFLA\"}"))
                .andExpect(status().isBadRequest());

        for (int i = 3; i <= 32; i++) {
            this.mockMvc
                    .perform(post("/api/v1/sports-events/COMPETITION/{id}/teams", comp.getId())
                            .with(userJwt("captain-" + i, "Capitão " + i)).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"Time " + i + "\",\"memberNames\":[\"Atleta\"]}"))
                    .andExpect(status().isCreated());
        }
        when(this.campusEventOrganizerClient.containsAcademicSchedule(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("organizer-token")))
                .thenReturn(true);
        Instant firstMatch = java.time.LocalDate.of(2027, 7, 3).atTime(8, 0)
                .atZone(java.time.ZoneId.of("America/Sao_Paulo")).toInstant();
        MvcResult matchesResult = this.mockMvc
                .perform(post("/api/v1/sports-events/COMPETITION/{id}/matches/generate", comp.getId())
                        .with(organizerJwt()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"location":"Quadra 1 UFLA","firstMatchAt":"%s"}
                                """.formatted(firstMatch)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.length()").value(48)).andReturn();
        JsonNode generated = this.objectMapper.readTree(matchesResult.getResponse().getContentAsString());
        String matchId = "";
        for (JsonNode game : generated) {
            if ((game.get("homeTeamName").asText() + game.get("awayTeamName").asText()).contains("Time Alpha")
                    && (game.get("homeTeamName").asText() + game.get("awayTeamName").asText()).contains("Time Beta")) {
                matchId = game.get("id").asText();
                break;
            }
        }
        org.junit.jupiter.api.Assertions.assertFalse(matchId.isEmpty());

        // Organizer generates check-in token
        MvcResult tokenResult = this.mockMvc
                .perform(post("/api/v1/sports-matches/{id}/checkin-token", matchId).with(organizerJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.checkinToken").isNotEmpty()).andReturn();
        String checkinToken = this.objectMapper.readTree(tokenResult.getResponse().getContentAsString())
                .get("checkinToken").asText();

        // Unenrolled user cannot check in
        this.mockMvc
                .perform(post("/api/v1/sports-matches/{id}/checkins", matchId).with(userJwt("outsider", "Fora"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + checkinToken + "\"}"))
                .andExpect(status().isForbidden());

        // Free agent allocated to Team Beta checks in successfully
        this.mockMvc
                .perform(post("/api/v1/sports-matches/{id}/checkins", matchId).with(userJwt("free-1", "Lucas"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + checkinToken + "\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.userId").value("free-1"));

        // Player sees upcoming match in /api/v1/sports-matches/me
        this.mockMvc.perform(get("/api/v1/sports-matches/me").with(userJwt("free-1", "Lucas")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.items[?(@.matchId == '" + matchId + "')].viewerCheckedIn")
                        .value(org.hamcrest.Matchers.contains(true)));

        // Organizer can view live check-ins before match finishes, but cannot close
        // early
        this.mockMvc.perform(get("/api/v1/sports-matches/{id}/attendance", matchId).with(organizerJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.entries[0].name").value("Lucas"))
                .andExpect(jsonPath("$.closedAt").doesNotExist());
        this.mockMvc.perform(post("/api/v1/sports-matches/{id}/attendance", matchId).with(organizerJwt()))
                .andExpect(status().isConflict());

        // Organizer records score
        this.mockMvc
                .perform(patch("/api/v1/sports-matches/{id}/score", matchId).with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"homeScore\":3,\"awayScore\":2}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.homeScore").value(3)).andExpect(jsonPath("$.awayScore").value(2));

        // Overview returns complete modal payload
        this.mockMvc.perform(get("/api/v1/sports-events/COMPETITION/{id}/overview", comp.getId()).with(organizerJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.viewerCanManage").value(true))
                .andExpect(jsonPath("$.teams.length()").value(32))
                .andExpect(jsonPath("$.matches[?(@.id == '" + matchId + "')].checkinCount")
                        .value(org.hamcrest.Matchers.contains(1)))
                .andExpect(jsonPath("$.matches[?(@.id == '" + matchId + "')].viewerCanReviewAttendance")
                        .value(org.hamcrest.Matchers.contains(true)));

        this.mockMvc.perform(get("/api/v1/sports-matches/{id}/attendance", matchId).with(userJwt("free-1", "Lucas")))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(get("/api/v1/sports-matches/{id}/attendance", matchId).with(organizerJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.entries[0].name").value("Lucas"))
                .andExpect(jsonPath("$.closedAt").doesNotExist());
        this.mockMvc.perform(post("/api/v1/sports-matches/{id}/attendance", matchId).with(organizerJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.closedAt").isNotEmpty());
        this.mockMvc.perform(post("/api/v1/sports-matches/{id}/checkin-token", matchId).with(organizerJwt()))
                .andExpect(status().isConflict());

        JsonNode scoredGame = null;
        for (JsonNode game : generated) {
            if (game.get("id").asText().equals(matchId)) {
                scoredGame = game;
            }
        }
        org.junit.jupiter.api.Assertions.assertNotNull(scoredGame);
        String strongest = scoredGame.get("homeTeamId").asText();
        String groupVenue = scoredGame.get("location").asText();
        var peers = new java.util.TreeSet<String>();
        for (JsonNode game : generated) {
            if (game.get("location").asText().equals(groupVenue)) {
                peers.add(game.get("homeTeamId").asText());
                peers.add(game.get("awayTeamId").asText());
            }
        }
        peers.remove(strongest);
        var tied = peers.stream().limit(2).toList();
        for (JsonNode game : generated) {
            if (!game.get("id").asText().equals(matchId)) {
                String home = game.get("homeTeamId").asText();
                String away = game.get("awayTeamId").asText();
                boolean tie = tied.contains(home) && tied.contains(away);
                boolean homeWins = home.equals(strongest) || !away.equals(strongest) && home.compareTo(away) < 0;
                recordGame(game,
                        tie
                                ? "{\"homeScore\":1,\"awayScore\":1}"
                                : homeWins ? "{\"homeScore\":1,\"awayScore\":0}" : "{\"homeScore\":0,\"awayScore\":1}");
            }
        }
        org.junit.jupiter.api.Assertions.assertEquals(64, readTournamentMatches(comp.getId()).size());
        this.mockMvc.perform(get("/api/v1/sports-events/COMPETITION/{id}/overview", comp.getId()).with(organizerJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.standings.length()").value(8))
                .andExpect(jsonPath("$.phase").value("ROLANDO"));
        for (int round : List.of(4, 6, 8)) {
            int expectedGames = 8 >> ((round - 4) / 2);
            JsonNode bracket = readTournamentMatches(comp.getId());
            int firstLegs = 0;
            int secondLegs = 0;
            for (JsonNode game : bracket) {
                int number = game.get("roundNumber").asInt();
                if (number == round) {
                    recordGame(game, "{\"homeScore\":1,\"awayScore\":0}");
                    firstLegs++;
                } else if (number == round + 1) {
                    this.mockMvc
                            .perform(patch("/api/v1/sports-matches/{id}/score", game.get("id").asText())
                                    .with(organizerJwt()).contentType(MediaType.APPLICATION_JSON)
                                    .content("{\"homeScore\":1,\"awayScore\":0}"))
                            .andExpect(status().isBadRequest())
                            .andExpect(jsonPath("$.code").value("PENALTIES_REQUIRED"));
                    recordGame(game, "{\"homeScore\":1,\"awayScore\":0,\"homePenaltyScore\":5,\"awayPenaltyScore\":4}");
                    secondLegs++;
                }
            }
            org.junit.jupiter.api.Assertions.assertEquals(expectedGames, firstLegs);
            org.junit.jupiter.api.Assertions.assertEquals(expectedGames, secondLegs);
        }
        JsonNode finalGame = readTournamentMatches(comp.getId()).get(76);
        org.junit.jupiter.api.Assertions.assertEquals(10, finalGame.get("roundNumber").asInt());
        recordGame(finalGame, "{\"homeScore\":0,\"awayScore\":0,\"homePenaltyScore\":3,\"awayPenaltyScore\":4}");
        this.mockMvc.perform(get("/api/v1/sports-events/COMPETITION/{id}/overview", comp.getId()).with(organizerJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.knockoutTies.length()").value(15))
                .andExpect(jsonPath("$.knockoutTies[0].homeAggregate").value(1))
                .andExpect(jsonPath("$.knockoutTies[0].awayAggregate").value(1))
                .andExpect(jsonPath("$.knockoutTies[14].winnerTeamId").value(finalGame.get("awayTeamId").asText()));
    }

    @Test
    void seasonGeneratesNinetyGamesOverEighteenTuesdayAndThursdayRounds() throws Exception {
        Sport sport = new Sport(SPORT_ID, "Tênis", 1, 1, 2, true, 3, 1, 0, 3, "Regras.", "DEPARTMENT", ORGANIZER_ID,
                "ACTIVE");
        this.sportRepository.saveAndFlush(sport);
        Instant start = Instant.parse("2027-07-06T12:00:00Z");
        Season season = this.seasonRepository.saveAndFlush(new Season(UUID.randomUUID(), "Liga", sport, "COMPETITIVE",
                "DEPARTMENT", ORGANIZER_ID, 10, 1, 2, 0, 0, start.minusSeconds(86_400), "OPEN", "double round-robin"));
        when(this.campusEventOrganizerClient.getContexts("organizer-token"))
                .thenReturn(new EventOrganizerContextsResponse(
                        List.of(new EventOrganizerContext("DEPARTMENT", ORGANIZER_ID, "DCC"))));
        this.mockMvc
                .perform(patch("/api/v1/sports-events/SEASON/{id}", season.getId()).with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"registrationDeadline\":\"" + start.minusSeconds(86_400) + "\"}"))
                .andExpect(status().isOk());
        for (int i = 1; i <= 10; i++) {
            MvcResult team = this.mockMvc
                    .perform(post("/api/v1/sports-events/SEASON/{id}/teams", season.getId())
                            .with(userJwt("league-" + i, "Capitão " + i)).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"Time " + i + "\",\"reservedPlayerCount\":" + (i == 1 ? 2 : 1) + "}"))
                    .andExpect(status().isCreated()).andReturn();
            if (i == 1) {
                String code = this.objectMapper.readTree(team.getResponse().getContentAsString()).get("inviteCode")
                        .asText();
                this.mockMvc
                        .perform(post("/api/v1/sports-events/SEASON/{id}/teams/join", season.getId())
                                .with(userJwt("league-partner", "Parceira")).contentType(MediaType.APPLICATION_JSON)
                                .content("{\"inviteCode\":\"" + code + "\"}"))
                        .andExpect(status().isCreated()).andExpect(jsonPath("$.members.length()").value(2));
            }
        }
        this.mockMvc
                .perform(post("/api/v1/sports-events/SEASON/{id}/matches/generate", season.getId()).with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"location\":\"Quadra 1\",\"firstMatchAt\":\"" + start + "\"}"))
                .andExpect(status().isBadRequest());
        when(this.campusEventOrganizerClient.containsAcademicSchedule(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("organizer-token")))
                .thenReturn(true);
        MvcResult result = this.mockMvc
                .perform(post("/api/v1/sports-events/SEASON/{id}/matches/generate", season.getId()).with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"location":"Quadra 1","firstMatchAt":"%s"}
                                """.formatted(start)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.length()").value(90)).andReturn();
        JsonNode games = this.objectMapper.readTree(result.getResponse().getContentAsString());
        java.util.Map<Integer, Integer> rounds = new java.util.HashMap<>();
        java.util.Set<String> directedFixtures = new java.util.HashSet<>();
        for (JsonNode game : games) {
            var day = Instant.parse(game.get("scheduledAt").asText()).atZone(java.time.ZoneId.of("America/Sao_Paulo"))
                    .getDayOfWeek();
            org.junit.jupiter.api.Assertions
                    .assertTrue(day == java.time.DayOfWeek.TUESDAY || day == java.time.DayOfWeek.THURSDAY);
            rounds.merge(game.get("roundNumber").asInt(), 1, Integer::sum);
            directedFixtures.add(game.get("homeTeamId").asText() + ":" + game.get("awayTeamId").asText());
        }
        org.junit.jupiter.api.Assertions.assertEquals(18, rounds.size());
        org.junit.jupiter.api.Assertions.assertTrue(rounds.values().stream().allMatch(count -> count == 5));
        org.junit.jupiter.api.Assertions.assertEquals(90, directedFixtures.size());
        this.mockMvc.perform(get("/api/v1/seasons/{id}", season.getId()).with(userJwt())).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        String champion = games.get(0).get("homeTeamId").asText();
        String decision = "{\"championTeamId\":\"" + champion + "\"}";
        this.mockMvc.perform(patch("/api/v1/sports-events/SEASON/{id}", season.getId()).with(organizerJwt())
                .contentType(MediaType.APPLICATION_JSON).content(decision)).andExpect(status().isConflict());
        for (JsonNode game : games) {
            recordGame(game, "{\"homeScore\":1,\"awayScore\":1}");
        }
        this.mockMvc.perform(get("/api/v1/sports-events/SEASON/{id}/overview", season.getId()).with(organizerJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.manualChampionCandidates.length()").value(10))
                .andExpect(jsonPath("$.championTeamId").doesNotExist()).andExpect(jsonPath("$.phase").value("ROLANDO"));
        this.mockMvc
                .perform(patch("/api/v1/sports-events/SEASON/{id}", season.getId()).with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON).content(decision))
                .andExpect(status().isOk()).andExpect(jsonPath("$.championTeamId").value(champion));
        this.mockMvc.perform(get("/api/v1/sports-events/SEASON/{id}/overview", season.getId()).with(userJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.manualChampionCandidates").isEmpty())
                .andExpect(jsonPath("$.championTeamId").value(champion))
                .andExpect(jsonPath("$.phase").value("FINALIZADO"));
        this.mockMvc
                .perform(
                        patch("/api/v1/sports-matches/{id}/score", games.get(0).get("id").asText()).with(organizerJwt())
                                .contentType(MediaType.APPLICATION_JSON).content("{\"homeScore\":1,\"awayScore\":0}"))
                .andExpect(status().isConflict());

        this.mockMvc.perform(post("/api/v1/sports-events/SEASON/{id}/cancel", season.getId()).with(organizerJwt()))
                .andExpect(status().isOk());

    }

    private void recordGame(JsonNode game, String score) throws Exception {
        this.mockMvc.perform(patch("/api/v1/sports-matches/{id}/score", game.get("id").asText()).with(organizerJwt())
                .contentType(MediaType.APPLICATION_JSON).content(score)).andExpect(status().isOk());
    }

    private JsonNode readTournamentMatches(UUID id) throws Exception {
        MvcResult result = this.mockMvc
                .perform(get("/api/v1/sports-events/COMPETITION/{id}/overview", id).with(organizerJwt()))
                .andExpect(status().isOk()).andReturn();
        return this.objectMapper.readTree(result.getResponse().getContentAsString()).get("matches");
    }

    @Test
    void freeAgentQueueAutoFormsTeamWhenRosterMinIsReached() throws Exception {
        Sport sport = new Sport(SPORT_ID, "Vôlei de Dupla", 2, 2, 2, false, 2, 0, 1, 2, "Duplas.", "DEPARTMENT",
                ORGANIZER_ID, "ACTIVE");
        this.sportRepository.saveAndFlush(sport);
        Season season = new Season(UUID.randomUUID(), "Liga de Duplas", sport, "RECREATIONAL", "DEPARTMENT",
                ORGANIZER_ID, 10, 2, 2, 0, 0, Instant.now().plusSeconds(86_400), "OPEN", "double round-robin");
        this.seasonRepository.saveAndFlush(season);

        this.mockMvc
                .perform(post("/api/v1/sports-events/SEASON/{id}/free-agents", season.getId())
                        .with(userJwt("fa-1", "Ana")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("QUEUED"));

        this.mockMvc
                .perform(post("/api/v1/sports-events/SEASON/{id}/free-agents", season.getId())
                        .with(userJwt("fa-2", "Bruno")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ALLOCATED"))
                .andExpect(jsonPath("$.teamName").value("Equipe Free Agents #1"));
    }

    @Test
    void paidSportsRegistrationUsesOutboxAndConfirmsViaPaymentSaga() throws Exception {
        Sport sport = new Sport(SPORT_ID, "Futsal Pago", 5, 2, 4, true, 3, 1, 0, 3, "Regras.", "DEPARTMENT",
                ORGANIZER_ID, "ACTIVE");
        this.sportRepository.saveAndFlush(sport);
        Competition comp = new Competition(UUID.randomUUID(), "Copa Paga UFLA", sport, "COMPETITIVE", "DEPARTMENT",
                ORGANIZER_ID, 16, 2, 4, 5000, 1000, Instant.now().plusSeconds(86_400), "OPEN", "GROUPS_KNOCKOUT");
        this.competitionRepository.saveAndFlush(comp);

        MvcResult teamResult = this.mockMvc
                .perform(post("/api/v1/sports-events/COMPETITION/{id}/teams", comp.getId())
                        .with(userJwt("payer-1", "Rafael")).contentType(MediaType.APPLICATION_JSON).content("""
                                {"name":"Time Pago","memberNames":[]}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING_PAYMENT")).andReturn();
        String teamId = this.objectMapper.readTree(teamResult.getResponse().getContentAsString()).get("id").asText();

        this.mockMvc.perform(get("/api/v1/sports-payment-origins/me").with(userJwt("payer-1", "Rafael")))
                .andExpect(status().isOk()).andExpect(jsonPath("$['" + teamId + "']").value("SPORTS_TEAM"));
        this.mockMvc.perform(get("/api/v1/payment-references/me").with(userJwt("payer-1", "Rafael")))
                .andExpect(status().isOk()).andExpect(jsonPath("$['" + teamId + "'].origin").value("SPORTS_TEAM"))
                .andExpect(jsonPath("$['" + teamId + "'].title").value("Copa Paga UFLA"))
                .andExpect(jsonPath("$['" + teamId + "'].subtitle").value("Equipe · Time Pago"))
                .andExpect(jsonPath("$['" + teamId + "'].targetPath").value("/esportes/campeonatos/" + comp.getId()));
        this.mockMvc.perform(get("/api/v1/sports-payment-origins/me").with(userJwt("outsider", "Fora")))
                .andExpect(status().isOk()).andExpect(jsonPath("$['" + teamId + "']").doesNotExist());

        // Not yet in /sports-events/me before payment confirmation
        this.mockMvc.perform(get("/api/v1/sports-events/me").with(userJwt("payer-1", "Rafael")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));

        // Outbox event was written for Payment service
        Integer outboxCount = this.jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM outbox_events WHERE aggregate_id = ?", Integer.class, UUID.fromString(teamId));
        org.junit.jupiter.api.Assertions.assertEquals(1, outboxCount);

        // Payment service publishes PaymentConfirmed -> Engagement confirms the team
        UUID chargeId = UUID.randomUUID();
        Instant now = Instant.now();
        String envelopeJson = """
                {"messageId":"%s","eventType":"PaymentConfirmed","aggregateType":"Charge","aggregateId":"%s",
                 "schemaVersion":1,"occurredAt":"%s",
                 "payloadJson":{"chargeId":"%s","registrationId":"%s","eventId":"%s","userId":"payer-1",
                                "amountMinor":5000,"currency":"BRL","paidAt":"%s"}}
                """.formatted(UUID.randomUUID(), chargeId, now, chargeId, teamId, comp.getId(), now);
        this.paymentConfirmationService.consume(envelopeJson.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        // Now appears in /sports-events/me!
        this.mockMvc.perform(get("/api/v1/sports-events/me").with(userJwt("payer-1", "Rafael")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].title").value("Copa Paga UFLA"))
                .andExpect(jsonPath("$.items[0].teamName").value("Time Pago"));
    }

    @Test
    void knockoutReturnLegRequiresPenaltiesOnlyOnAggregateTie() throws Exception {
        Sport sport = sport(SPORT_ID, "Futsal Mata-Mata");
        this.sportRepository.saveAndFlush(sport);
        Competition comp = competition(UUID.randomUUID(), "Copa Mata-Mata", sport, 32, "ACTIVE");
        this.competitionRepository.saveAndFlush(comp);
        when(this.campusEventOrganizerClient.getContexts("organizer-token"))
                .thenReturn(new EventOrganizerContextsResponse(
                        List.of(new EventOrganizerContext("DEPARTMENT", ORGANIZER_ID, "Departamento"))));

        UUID teamA = UUID.randomUUID();
        UUID teamB = UUID.randomUUID();
        Instant now = Instant.now();
        this.jdbcTemplate.update(
                "INSERT INTO sports_teams (id, context_type, context_id, name, captain_user_id, status, created_at) VALUES (?, 'COMPETITION', ?, 'Time A', 'cap-a', 'CONFIRMED', ?)",
                teamA, comp.getId(), java.sql.Timestamp.from(now));
        this.jdbcTemplate.update(
                "INSERT INTO sports_teams (id, context_type, context_id, name, captain_user_id, status, created_at) VALUES (?, 'COMPETITION', ?, 'Time B', 'cap-b', 'CONFIRMED', ?)",
                teamB, comp.getId(), java.sql.Timestamp.from(now));

        UUID idaId = UUID.randomUUID();
        UUID voltaId = UUID.randomUUID();
        // Ida: Time A 3 x 1 Time B
        this.jdbcTemplate.update(
                "INSERT INTO sports_matches (id, context_type, context_id, round_number, home_team_id, away_team_id, scheduled_at, location, home_score, away_score, status, created_at) VALUES (?, 'COMPETITION', ?, 4, ?, ?, ?, 'Quadra 1 · Oitavas 1 · Ida', 3, 1, 'COMPLETED', ?)",
                idaId, comp.getId(), teamA, teamB, java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        // Volta: Time B (home) x Time A (away)
        this.jdbcTemplate.update(
                "INSERT INTO sports_matches (id, context_type, context_id, round_number, home_team_id, away_team_id, scheduled_at, location, status, created_at) VALUES (?, 'COMPETITION', ?, 5, ?, ?, ?, 'Quadra 1 · Oitavas 1 · Volta', 'SCHEDULED', ?)",
                voltaId, comp.getId(), teamB, teamA, java.sql.Timestamp.from(now.plusSeconds(3600)),
                java.sql.Timestamp.from(now));

        // 1) Volta ends 2 x 2 -> aggregate is Time B 3 x 5 Time A (NOT tied) ->
        // succeeds WITHOUT penalties
        this.mockMvc
                .perform(patch("/api/v1/sports-matches/{id}/score", voltaId).with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"homeScore":2,"awayScore":2}
                                """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.homeScore").value(2))
                .andExpect(jsonPath("$.awayScore").value(2)).andExpect(jsonPath("$.homePenaltyScore").doesNotExist())
                .andExpect(jsonPath("$.awayPenaltyScore").doesNotExist());

        // 2) Volta ends 2 x 0 -> aggregate is Time B 3 x 3 Time A (TIED!) -> missing
        // penalties fails with 400
        this.mockMvc.perform(patch("/api/v1/sports-matches/{id}/score", voltaId).with(organizerJwt())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"homeScore":2,"awayScore":0}
                        """)).andExpect(status().isBadRequest());

        // 3) Volta ends 2 x 0 with penalties 5 x 4 -> succeeds and persists penalty
        // scores
        this.mockMvc
                .perform(patch("/api/v1/sports-matches/{id}/score", voltaId).with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"homeScore":2,"awayScore":0,"homePenaltyScore":5,"awayPenaltyScore":4}
                                """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.homeScore").value(2))
                .andExpect(jsonPath("$.awayScore").value(0)).andExpect(jsonPath("$.homePenaltyScore").value(5))
                .andExpect(jsonPath("$.awayPenaltyScore").value(4));
    }

    @Test
    void persistenceEnforcesCompetitionFormatAndSeasonTeamCountRules() {
        Sport sport = sport(SPORT_ID, "Basquete");
        this.sportRepository.saveAndFlush(sport);
        Competition invalidCompetition = new Competition(UUID.randomUUID(), "Formato não suportado", sport,
                "COMPETITIVE", "DEPARTMENT", ORGANIZER_ID, 16, 5, 10, 0, 0, Instant.now().plusSeconds(86_400), null,
                "ROUND_ROBIN");
        Season invalidSeason = new Season(UUID.randomUUID(), "Turno incompatível", sport, "COMPETITIVE", "DEPARTMENT",
                ORGANIZER_ID, 10, 5, 10, 0, 0, Instant.now().plusSeconds(86_400), null, "single round-robin");

        org.junit.jupiter.api.Assertions.assertThrows(DataIntegrityViolationException.class,
                () -> this.competitionRepository.saveAndFlush(invalidCompetition));
        org.junit.jupiter.api.Assertions.assertThrows(DataIntegrityViolationException.class,
                () -> this.seasonRepository.saveAndFlush(invalidSeason));
    }

    private static Sport sport(UUID id, String name) {
        return new Sport(id, name, 5, 7, 12, true, 3, 1, 0, 3, "Valores de teste aprovados.", "DEPARTMENT",
                ORGANIZER_ID, null);
    }

    private static Competition competition(UUID id, String title, Sport sport, int targetTeams, String status) {
        return new Competition(id, title, sport, "COMPETITIVE", "DEPARTMENT", ORGANIZER_ID, targetTeams, 7, 12, 1000,
                100, Instant.now().plusSeconds(86_400), status, "GROUPS_KNOCKOUT");
    }

    private static Season season(UUID id, String title, Sport sport, int targetTeams) {
        String roundRobinMode = targetTeams == 10 ? "double round-robin" : "single round-robin";
        return new Season(id, title, sport, "RECREATIONAL", "DEPARTMENT", ORGANIZER_ID, targetTeams, 7, 12, 500, 50,
                Instant.now().plusSeconds(86_400), null, roundRobinMode);
    }

    private static RequestPostProcessor userJwt() {
        return userJwt("sports-reader", "Sports Reader");
    }

    private static RequestPostProcessor userJwt(String subject, String name) {
        return jwt().jwt(token -> token.subject(subject).claim("name", name))
                .authorities(new SimpleGrantedAuthority("ROLE_USER"));
    }

    private static RequestPostProcessor organizerJwt() {
        return jwt().jwt(token -> token.tokenValue("organizer-token").subject("organizer-1").claim("name", "Prof. Ana"))
                .authorities(new SimpleGrantedAuthority("ROLE_USER"));
    }
}

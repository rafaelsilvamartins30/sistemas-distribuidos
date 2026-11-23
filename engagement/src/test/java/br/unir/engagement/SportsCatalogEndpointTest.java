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
        this.jdbcTemplate.update("DELETE FROM sports_teams");
        this.jdbcTemplate.update("DELETE FROM seasons");
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
                .andExpect(jsonPath("$.sportName").value("Vôlei"))
                .andExpect(jsonPath("$.tieBreakers[0]").value("SCORE_DIFFERENCE"));
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
                                 "organizerType":"DEPARTMENT","organizerId":"%s","targetTeamCount":16,
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
                ORGANIZER_ID, new UUID[0], 16, 2, 4, new String[]{"SCORE_DIFFERENCE", "WINS"}, 0, 0,
                Instant.now().plusSeconds(86_400), null, "OPEN", "GROUPS_KNOCKOUT");
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

        // Organizer generates matches
        MvcResult matchesResult = this.mockMvc
                .perform(post("/api/v1/sports-events/COMPETITION/{id}/matches/generate", comp.getId())
                        .with(organizerJwt()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"location":"Quadra 1 UFLA"}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].location").value("Quadra 1 UFLA")).andReturn();
        JsonNode generated = this.objectMapper.readTree(matchesResult.getResponse().getContentAsString());
        String matchId = generated.get(0).get("id").asText();

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
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].teamName").value("Time Beta"))
                .andExpect(jsonPath("$.items[0].opponentName").value("Time Alpha"))
                .andExpect(jsonPath("$.items[0].viewerCheckedIn").value(true));

        // Organizer records score
        this.mockMvc
                .perform(patch("/api/v1/sports-matches/{id}/score", matchId).with(organizerJwt())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"homeScore\":3,\"awayScore\":2}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.homeScore").value(3)).andExpect(jsonPath("$.awayScore").value(2));

        // Overview returns complete modal payload
        this.mockMvc.perform(get("/api/v1/sports-events/COMPETITION/{id}/overview", comp.getId()).with(organizerJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.viewerCanManage").value(true))
                .andExpect(jsonPath("$.teams.length()").value(2))
                .andExpect(jsonPath("$.matches[0].checkinCount").value(1))
                .andExpect(jsonPath("$.matches[0].checkinToken").value(checkinToken));
    }

    @Test
    void freeAgentQueueAutoFormsTeamWhenRosterMinIsReached() throws Exception {
        Sport sport = new Sport(SPORT_ID, "Vôlei de Dupla", 2, 2, 2, false, 2, 0, 1, 2, "Duplas.", "DEPARTMENT",
                ORGANIZER_ID, "ACTIVE");
        this.sportRepository.saveAndFlush(sport);
        Season season = new Season(UUID.randomUUID(), "Liga de Duplas", sport, "RECREATIONAL", "DEPARTMENT",
                ORGANIZER_ID, new UUID[0], 10, 2, 2, new String[]{"WINS"}, 0, 0, Instant.now().plusSeconds(86_400),
                "OPEN", "double round-robin");
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
                ORGANIZER_ID, new UUID[0], 16, 2, 4, new String[]{"SCORE_DIFFERENCE"}, 5000, 1000,
                Instant.now().plusSeconds(86_400), null, "OPEN", "GROUPS_KNOCKOUT");
        this.competitionRepository.saveAndFlush(comp);

        MvcResult teamResult = this.mockMvc
                .perform(post("/api/v1/sports-events/COMPETITION/{id}/teams", comp.getId())
                        .with(userJwt("payer-1", "Rafael")).contentType(MediaType.APPLICATION_JSON).content("""
                                {"name":"Time Pago","memberNames":[]}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING_PAYMENT")).andReturn();
        String teamId = this.objectMapper.readTree(teamResult.getResponse().getContentAsString()).get("id").asText();

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
                "COMPETITIVE", "DEPARTMENT", ORGANIZER_ID, new UUID[0], 16, 5, 10, new String[]{"WINS"}, 0, 0,
                Instant.now().plusSeconds(86_400), null, null, "ROUND_ROBIN");
        Season invalidSeason = new Season(UUID.randomUUID(), "Turno incompatível", sport, "COMPETITIVE", "DEPARTMENT",
                ORGANIZER_ID, new UUID[0], 10, 5, 10, new String[0], 0, 0, Instant.now().plusSeconds(86_400), null,
                "single round-robin");

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
        return new Competition(id, title, sport, "COMPETITIVE", "DEPARTMENT", ORGANIZER_ID,
                new UUID[]{UUID.randomUUID()}, targetTeams, 7, 12, new String[]{"SCORE_DIFFERENCE", "WINS"}, 1000, 100,
                Instant.now().plusSeconds(86_400), null, status, "GROUPS_KNOCKOUT");
    }

    private static Season season(UUID id, String title, Sport sport, int targetTeams) {
        String roundRobinMode = targetTeams == 10 ? "double round-robin" : "single round-robin";
        return new Season(id, title, sport, "RECREATIONAL", "DEPARTMENT", ORGANIZER_ID, new UUID[0], targetTeams, 7, 12,
                new String[]{"HEAD_TO_HEAD"}, 500, 50, Instant.now().plusSeconds(86_400), null, roundRobinMode);
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

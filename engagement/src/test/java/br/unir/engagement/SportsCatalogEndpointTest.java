package br.unir.engagement;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.unir.engagement.entity.Competition;
import br.unir.engagement.entity.Season;
import br.unir.engagement.service.EventProjectionStore;
import br.unir.engagement.entity.Sport;
import br.unir.engagement.repository.CompetitionRepository;
import br.unir.engagement.repository.SeasonRepository;
import br.unir.engagement.repository.SportRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
class SportsCatalogEndpointTest {

    @MockitoBean
    private EventProjectionStore eventProjectionStore;

    private static final UUID SPORT_ID = UUID.fromString("40000000-0000-4000-8000-000000000001");
    private static final UUID ORGANIZER_ID = UUID.fromString("40000000-0000-4000-8000-000000000002");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private CompetitionRepository competitionRepository;

    @Autowired
    private SeasonRepository seasonRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clearSportsCatalog() {
        this.jdbcTemplate.update("DELETE FROM seasons");
        this.jdbcTemplate.update("DELETE FROM competitions");
        this.jdbcTemplate.update("DELETE FROM sports");
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
    void catalogRequiresUserRoleValidatesPageAndFormatFiltersAndHasNoWriteEndpoints() throws Exception {
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
        this.mockMvc.perform(post("/api/v1/sports").with(userJwt())).andExpect(status().isForbidden());
        this.mockMvc.perform(put("/api/v1/competitions/{id}", UUID.randomUUID()).with(userJwt()))
                .andExpect(status().isForbidden());
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
        return jwt().jwt(token -> token.subject("sports-reader")).authorities(new SimpleGrantedAuthority("ROLE_USER"));
    }
}

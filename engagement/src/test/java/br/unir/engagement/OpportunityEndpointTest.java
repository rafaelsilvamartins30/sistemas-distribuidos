package br.unir.engagement;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.unir.engagement.client.CampusOpportunityPublisherClient;
import br.unir.engagement.dto.OpportunityPublisherContext;
import br.unir.engagement.dto.OpportunityPublisherContextsResponse;
import br.unir.engagement.entity.Opportunity;
import br.unir.engagement.repository.OpportunityRepository;
import br.unir.engagement.service.EventProjectionStore;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.server.ResponseStatusException;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
@AutoConfigureMockMvc
class OpportunityEndpointTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private OpportunityRepository opportunityRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private CampusOpportunityPublisherClient campusPublisherClient;

    @MockitoBean
    private EventProjectionStore eventProjectionStore;

    @BeforeEach
    void clearOpportunities() {
        this.jdbcTemplate.update("DELETE FROM opportunities");
    }

    @Test
    void listsOnlyActiveUnexpiredOpportunitiesWithPaginationAndFilters() throws Exception {
        Instant now = Instant.now();
        UUID departmentId = UUID.randomUUID();
        Opportunity older = opportunity(UUID.randomUUID(), "Estágio em sistemas distribuídos",
                "Desenvolvimento de serviços e APIs.", "DEPARTMENT", departmentId, "ESTÁGIO", now.plusSeconds(86_400),
                now.minusSeconds(3_600), "ACTIVE");
        Opportunity newer = opportunity(UUID.randomUUID(), "Bolsa em pesquisa de dados",
                "Pesquisa de dados e aprendizado de máquina.", "ACADEMIC_ENTITY", UUID.randomUUID(), "PESQUISA", null,
                now.minusSeconds(60), "ACTIVE");
        Opportunity expired = opportunity(UUID.randomUUID(), "Inscrição encerrada",
                "Esta oportunidade deve permanecer acessível no histórico.", "PROFESSOR", UUID.randomUUID(), "PESQUISA",
                now.minusSeconds(60), now, "ACTIVE");
        Opportunity cancelled = opportunity(UUID.randomUUID(), "Oportunidade cancelada",
                "Esta oportunidade deve permanecer acessível no histórico.", "DEPARTMENT", departmentId, "ESTÁGIO",
                now.plusSeconds(86_400), now.plusSeconds(30), "CANCELLED");
        this.opportunityRepository.saveAllAndFlush(List.of(older, newer, expired, cancelled));

        this.mockMvc.perform(get("/api/v1/opportunities?page=0&size=1").with(userJwt())).andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(newer.getId().toString()));

        this.mockMvc.perform(get("/api/v1/opportunities?page=1&size=1").with(userJwt())).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(older.getId().toString()));

        this.mockMvc
                .perform(get("/api/v1/opportunities?q=distribuídos&category=estágio&publisherType=department")
                        .with(userJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(older.getId().toString()));
    }

    @Test
    void opportunityDetailsRemainAvailableAfterDeadlineOrStatusChanges() throws Exception {
        Instant now = Instant.now();
        Opportunity expired = opportunity(UUID.randomUUID(), "Oportunidade encerrada", "Detalhes preservados.",
                "PROFESSOR", UUID.randomUUID(), "PESQUISA", now.minusSeconds(60), now.minusSeconds(3600), "ACTIVE");
        Opportunity cancelled = opportunity(UUID.randomUUID(), "Oportunidade cancelada", "Detalhes preservados.",
                "ACADEMIC_ENTITY", UUID.randomUUID(), "EXTENSÃO", now.plusSeconds(86_400), now.minusSeconds(1800),
                "CANCELLED");
        this.opportunityRepository.saveAllAndFlush(List.of(expired, cancelled));

        this.mockMvc.perform(get("/api/v1/opportunities/{id}", expired.getId()).with(userJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(expired.getId().toString()))
                .andExpect(jsonPath("$.deadline").exists())
                .andExpect(jsonPath("$.externalUrl").value(expired.getExternalUrl()));
        this.mockMvc.perform(get("/api/v1/opportunities/{id}", cancelled.getId()).with(userJwt()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        this.mockMvc.perform(get("/api/v1/opportunities/{id}", UUID.randomUUID()).with(userJwt()))
                .andExpect(status().isNotFound());
    }

    @Test
    void opportunityReadAndWriteRoutesRequireAuthenticationAndValidateFilters() throws Exception {
        this.mockMvc.perform(get("/api/v1/opportunities")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/opportunities").header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized());
        this.mockMvc
                .perform(get("/api/v1/opportunities").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_GUEST"))))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(get("/api/v1/opportunities?page=-1").with(userJwt())).andExpect(status().isBadRequest());
        this.mockMvc.perform(get("/api/v1/opportunities?size=101").with(userJwt())).andExpect(status().isBadRequest());
        this.mockMvc.perform(get("/api/v1/opportunities?publisherType=COMMUNITY").with(userJwt()))
                .andExpect(status().isBadRequest());
        when(this.campusPublisherClient.getContexts(anyString()))
                .thenReturn(new OpportunityPublisherContextsResponse(List.of()));
        this.mockMvc.perform(post("/api/v1/opportunities").with(userJwt("caller-token"))
                .contentType(MediaType.APPLICATION_JSON).content(createRequest("DEPARTMENT", UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void authorizedDepartmentCanPublishAndTheServerSetsThePublisherAndStatus() throws Exception {
        UUID departmentId = UUID.randomUUID();
        when(this.campusPublisherClient.getContexts("caller-token"))
                .thenReturn(new OpportunityPublisherContextsResponse(
                        List.of(new OpportunityPublisherContext("DEPARTMENT", departmentId, "DCC"))));

        this.mockMvc
                .perform(post("/api/v1/opportunities").with(userJwt("caller-token"))
                        .contentType(MediaType.APPLICATION_JSON).content(createRequest("DEPARTMENT", departmentId)))
                .andExpect(status().isCreated())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").isNotEmpty()).andExpect(jsonPath("$.title").value("Estágio em software"))
                .andExpect(jsonPath("$.publisherType").value("DEPARTMENT"))
                .andExpect(jsonPath("$.publisherId").value(departmentId.toString()))
                .andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.createdAt").isNotEmpty());

        Opportunity saved = this.opportunityRepository.findAll().getFirst();
        org.junit.jupiter.api.Assertions.assertEquals(departmentId, saved.getPublisherId());
        org.junit.jupiter.api.Assertions.assertEquals("ACTIVE", saved.getStatus());
        org.junit.jupiter.api.Assertions.assertNotNull(saved.getCreatedAt());
    }

    @Test
    void campusUnavailablePreventsOpportunityPersistence() throws Exception {
        when(this.campusPublisherClient.getContexts("caller-token"))
                .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Campus is unavailable"));

        this.mockMvc.perform(post("/api/v1/opportunities").with(userJwt("caller-token"))
                .contentType(MediaType.APPLICATION_JSON).content(createRequest("DEPARTMENT", UUID.randomUUID())))
                .andExpect(status().isServiceUnavailable());

        org.junit.jupiter.api.Assertions.assertTrue(this.opportunityRepository.findAll().isEmpty());
    }

    @Test
    void professorCanPublishOnlyWhenCampusReportsAnActiveAffiliation() throws Exception {
        UUID profileId = UUID.randomUUID();
        when(this.campusPublisherClient.getContexts("caller-token"))
                .thenReturn(new OpportunityPublisherContextsResponse(
                        List.of(new OpportunityPublisherContext("PROFESSOR", profileId, "Professora Ana"))));

        this.mockMvc
                .perform(post("/api/v1/opportunities").with(userJwt("caller-token"))
                        .contentType(MediaType.APPLICATION_JSON).content(createRequest("PROFESSOR", profileId)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.publisherType").value("PROFESSOR"));
    }

    @Test
    void refusesSpoofedDepartmentCommunityAndClientManagedFields() throws Exception {
        UUID authorizedDepartment = UUID.randomUUID();
        UUID otherDepartment = UUID.randomUUID();
        UUID otherAcademicEntity = UUID.randomUUID();
        when(this.campusPublisherClient.getContexts("caller-token"))
                .thenReturn(new OpportunityPublisherContextsResponse(
                        List.of(new OpportunityPublisherContext("DEPARTMENT", authorizedDepartment, "DCC"))));

        this.mockMvc
                .perform(post("/api/v1/opportunities").with(userJwt("caller-token"))
                        .contentType(MediaType.APPLICATION_JSON).content(createRequest("DEPARTMENT", otherDepartment)))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(post("/api/v1/opportunities").with(userJwt("caller-token"))
                .contentType(MediaType.APPLICATION_JSON).content(createRequest("ACADEMIC_ENTITY", otherAcademicEntity)))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(post("/api/v1/opportunities").with(userJwt("caller-token"))
                .contentType(MediaType.APPLICATION_JSON).content(createRequest("COMMUNITY", authorizedDepartment)))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(post("/api/v1/opportunities").with(userJwt("caller-token"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(createRequest("DEPARTMENT", authorizedDepartment).replace("}", ",\"userId\":\"victim\"}")))
                .andExpect(status().isBadRequest());
        this.mockMvc
                .perform(
                        post("/api/v1/opportunities").with(userJwt("caller-token"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(createRequest("DEPARTMENT", authorizedDepartment)
                                        .replace("https://example.org/apply", "javascript:alert(1)")))
                .andExpect(status().isBadRequest());
        this.mockMvc.perform(post("/api/v1/opportunities").with(userJwt("caller-token"))
                .contentType(MediaType.APPLICATION_JSON).content(createRequest("DEPARTMENT", authorizedDepartment)
                        .replace("\"deadline\":null", "\"deadline\":\"2020-01-01T00:00:00Z\"")))
                .andExpect(status().isBadRequest());

        org.junit.jupiter.api.Assertions.assertTrue(this.opportunityRepository.findAll().isEmpty());
        verify(this.campusPublisherClient, never()).getContexts("not-the-callers-token");
    }

    @Test
    void publisherContextsAreAuthenticatedAndPassTheVerifiedTokenToCampus() throws Exception {
        UUID entityId = UUID.randomUUID();
        when(this.campusPublisherClient.getContexts("caller-token"))
                .thenReturn(new OpportunityPublisherContextsResponse(
                        List.of(new OpportunityPublisherContext("ACADEMIC_ENTITY", entityId, "LICA"))));

        this.mockMvc.perform(get("/api/v1/opportunities/publisher-contexts").with(userJwt("caller-token")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].publisherType").value("ACADEMIC_ENTITY"))
                .andExpect(jsonPath("$.items[0].publisherId").value(entityId.toString()));
        this.mockMvc.perform(get("/api/v1/opportunities/publisher-contexts")).andExpect(status().isUnauthorized());
        this.mockMvc
                .perform(
                        get("/api/v1/opportunities/publisher-contexts").header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void persistenceRejectsCommunityAsOpportunityPublisherType() {
        Opportunity communityPublished = opportunity(UUID.randomUUID(), "Título", "Descrição", "COMMUNITY",
                UUID.randomUUID(), "ESTÁGIO", null, Instant.now(), "ACTIVE");

        org.junit.jupiter.api.Assertions.assertThrows(DataIntegrityViolationException.class,
                () -> this.opportunityRepository.saveAndFlush(communityPublished));
    }

    @Test
    void publisherCanListManagedOpportunitiesUpdateDeadlineAndCloseOrReopen() throws Exception {
        Instant now = Instant.now();
        UUID departmentId = UUID.randomUUID();
        UUID otherDepartmentId = UUID.randomUUID();
        Opportunity managedActive = opportunity(UUID.randomUUID(), "Monitoria de Distribuídos",
                "Apoio às aulas de laboratório.", "DEPARTMENT", departmentId, "MONITORIA", now.plusSeconds(86_400),
                now.minusSeconds(120), "ACTIVE");
        Opportunity managedClosed = opportunity(UUID.randomUUID(), "Monitoria encerrada", "Edital anterior.",
                "DEPARTMENT", departmentId, "MONITORIA", now.minusSeconds(86_400), now.minusSeconds(3_600), "CLOSED");
        Opportunity otherDepartmentOpportunity = opportunity(UUID.randomUUID(), "Bolsa de outro departamento",
                "Não deve aparecer nas gerenciadas.", "DEPARTMENT", otherDepartmentId, "PESQUISA",
                now.plusSeconds(86_400), now.minusSeconds(60), "ACTIVE");
        this.opportunityRepository.saveAllAndFlush(List.of(managedActive, managedClosed, otherDepartmentOpportunity));

        when(this.campusPublisherClient.getContexts("dept-admin-token"))
                .thenReturn(new OpportunityPublisherContextsResponse(
                        List.of(new OpportunityPublisherContext("DEPARTMENT", departmentId, "DCC"))));
        when(this.campusPublisherClient.getContexts("regular-user-token"))
                .thenReturn(new OpportunityPublisherContextsResponse(List.of()));

        this.mockMvc.perform(get("/api/v1/opportunities/managed").with(userJwt("dept-admin-token")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.items[0].id").value(managedActive.getId().toString()))
                .andExpect(jsonPath("$.items[1].id").value(managedClosed.getId().toString()));

        this.mockMvc.perform(get("/api/v1/opportunities/managed").with(userJwt("regular-user-token")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.items.length()").value(0));

        String futureDeadline = now.plusSeconds(172_800).toString();
        this.mockMvc
                .perform(patch("/api/v1/opportunities/{id}", managedActive.getId()).with(userJwt("dept-admin-token"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Monitoria de Sistemas Distribuídos\",\"deadline\":\"" + futureDeadline
                                + "\",\"externalUrl\":\"https://example.org/novo-edital\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Monitoria de Sistemas Distribuídos"))
                .andExpect(jsonPath("$.externalUrl").value("https://example.org/novo-edital"))
                .andExpect(jsonPath("$.deadline").value(futureDeadline));

        this.mockMvc
                .perform(patch("/api/v1/opportunities/{id}", managedActive.getId()).with(userJwt("regular-user-token"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Tentativa não autorizada\"}"))
                .andExpect(status().isForbidden());

        this.mockMvc
                .perform(delete("/api/v1/opportunities/{id}", managedActive.getId()).with(userJwt("dept-admin-token")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLOSED"));

        this.mockMvc.perform(get("/api/v1/opportunities").with(userJwt("regular-user-token")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(otherDepartmentOpportunity.getId().toString()));

        this.mockMvc
                .perform(patch("/api/v1/opportunities/{id}", managedClosed.getId()).with(userJwt("dept-admin-token"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ACTIVE\"}"))
                .andExpect(status().isBadRequest());

        this.mockMvc
                .perform(patch("/api/v1/opportunities/{id}", managedClosed.getId()).with(userJwt("dept-admin-token"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ACTIVE\",\"clearDeadline\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.deadline").isEmpty());
    }

    private static Opportunity opportunity(UUID id, String title, String description, String publisherType,
            UUID publisherId, String category, Instant deadline, Instant createdAt, String status) {
        return new Opportunity(id, title, description, publisherType, publisherId, category, deadline,
                "https://example.org/apply", null, createdAt, status);
    }

    private static RequestPostProcessor userJwt() {
        return jwt().jwt(token -> token.subject("opportunity-reader"))
                .authorities(new SimpleGrantedAuthority("ROLE_USER"));
    }

    private static RequestPostProcessor userJwt(String tokenValue) {
        return jwt().jwt(token -> token.subject("opportunity-reader").tokenValue(tokenValue))
                .authorities(new SimpleGrantedAuthority("ROLE_USER"));
    }

    private static String createRequest(String publisherType, UUID publisherId) {
        return "{\"title\":\"Estágio em software\",\"description\":\"Atuação em serviços\"," + "\"publisherType\":\""
                + publisherType + "\",\"publisherId\":\"" + publisherId
                + "\",\"category\":\"ESTAGIO\",\"deadline\":null,"
                + "\"externalUrl\":\"https://example.org/apply\",\"imageUrl\":null}";
    }
}

package br.unir.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;

@SpringBootTest
@AutoConfigureMockMvc
class GatewayRoutingAndSecurityTest {

    private static final String ISSUER_PATH = "/realms/unir";
    private static final String JWKS_PATH = "/realms/unir/protocol/openid-connect/certs";
    private static final String KEY_ID = "gateway-test-key";
    private static final String PROFILE_JSON = "{\"id\":\"user-123\",\"name\":\"Ana Silva\","
            + "\"institutionalId\":\"12345\",\"affiliationStatus\":\"STUDENT\","
            + "\"academicLevel\":\"UNDERGRADUATE\",\"course\":\"Computação\","
            + "\"department\":\"Tecnologia\",\"interests\":[\"Sistemas distribuídos\"],"
            + "\"createdAt\":\"2026-10-14T12:00:00Z\",\"updatedAt\":\"2026-10-14T12:00:00Z\"}";

    private static final RSAKey VALID_JWK;
    private static final RSAKey OTHER_JWK;
    private static final HttpServer KEYCLOAK_SERVER;
    private static final HttpServer WEB_BFF_SERVER;
    private static final HttpServer ADMIN_BFF_SERVER;
    private static final AtomicReference<String> LAST_METHOD = new AtomicReference<>();
    private static final AtomicReference<String> LAST_PATH = new AtomicReference<>();
    private static final AtomicReference<String> LAST_QUERY = new AtomicReference<>();
    private static final AtomicReference<String> LAST_AUTHORIZATION = new AtomicReference<>();
    private static final AtomicReference<String> LAST_REQUEST_BODY = new AtomicReference<>();
    private static final AtomicReference<String> LAST_ADMIN_METHOD = new AtomicReference<>();
    private static final AtomicReference<String> LAST_ADMIN_PATH = new AtomicReference<>();
    private static final AtomicReference<String> LAST_ADMIN_AUTHORIZATION = new AtomicReference<>();
    private static final AtomicReference<Integer> BFF_STATUS = new AtomicReference<>(200);
    private static final AtomicReference<String> BFF_CONTENT_TYPE = new AtomicReference<>(
            MediaType.APPLICATION_JSON_VALUE);
    private static final AtomicReference<String> BFF_BODY = new AtomicReference<>(PROFILE_JSON);

    static {
        try {
            VALID_JWK = generateRsaJwk(KEY_ID);
            OTHER_JWK = generateRsaJwk(KEY_ID);
            KEYCLOAK_SERVER = startKeycloakServer();
            WEB_BFF_SERVER = startWebBffServer();
            ADMIN_BFF_SERVER = startAdminBffServer();
        } catch (Exception exception) {
            throw new ExceptionInInitializerError(exception);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        int keycloakPort = KEYCLOAK_SERVER.getAddress().getPort();
        int webBffPort = WEB_BFF_SERVER.getAddress().getPort();
        int adminBffPort = ADMIN_BFF_SERVER.getAddress().getPort();
        registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri",
                () -> "http://127.0.0.1:" + keycloakPort + ISSUER_PATH);
        registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri",
                () -> "http://127.0.0.1:" + keycloakPort + JWKS_PATH);
        registry.add("WEB_BFF_URL", () -> "http://127.0.0.1:" + webBffPort);
        registry.add("ADMIN_BFF_URL", () -> "http://127.0.0.1:" + adminBffPort);
    }

    @AfterAll
    static void stopServers() {
        KEYCLOAK_SERVER.stop(0);
        WEB_BFF_SERVER.stop(0);
        ADMIN_BFF_SERVER.stop(0);
    }

    @BeforeEach
    void resetBffState() {
        LAST_METHOD.set(null);
        LAST_PATH.set(null);
        LAST_QUERY.set(null);
        LAST_AUTHORIZATION.set(null);
        LAST_REQUEST_BODY.set(null);
        LAST_ADMIN_METHOD.set(null);
        LAST_ADMIN_PATH.set(null);
        LAST_ADMIN_AUTHORIZATION.set(null);
        BFF_STATUS.set(200);
        BFF_CONTENT_TYPE.set(MediaType.APPLICATION_JSON_VALUE);
        BFF_BODY.set(PROFILE_JSON);
    }

    @Test
    void rejectsRequestsWithoutBearerToken() throws Exception {
        this.mockMvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/university")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/academic-units")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/courses")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/departments")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/departments/department-1")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(post("/api/v1/web/rag/query").contentType(MediaType.APPLICATION_JSON)
                .content("{\"question\":\"Quais eventos?\"}")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/me/activities")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/attendance/me")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(post("/api/v1/web/attendance/check-ins")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(post("/api/v1/web/events/event-1/registrations")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(delete("/api/v1/web/registrations/registration-1")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/entities")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/entities/entity-1")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/communities")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/web/communities/community-1")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/api/v1/admin/me")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(post("/api/v1/users").contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isUnauthorized());
        this.mockMvc.perform(patch("/api/v1/me").contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isUnauthorized());
        assertThat(LAST_AUTHORIZATION.get()).isNull();
        assertThat(LAST_ADMIN_AUTHORIZATION.get()).isNull();
    }

    @Test
    void rejectsTokenWithInvalidSignature() throws Exception {
        String token = signToken(OTHER_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));

        this.mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized());
        this.mockMvc
                .perform(post("/api/v1/users").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isUnauthorized());
        this.mockMvc
                .perform(patch("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isUnauthorized());
        assertThat(LAST_AUTHORIZATION.get()).isNull();
    }

    @Test
    void rejectsTokenWithInvalidIssuer() throws Exception {
        String token = signToken(VALID_JWK, "http://evil-issuer.local/realms/unir", Instant.now().plusSeconds(300),
                List.of("USER"));

        this.mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized());
        assertThat(LAST_AUTHORIZATION.get()).isNull();
    }

    @Test
    void rejectsExpiredToken() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().minusSeconds(300), List.of("USER"));

        this.mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized());
        assertThat(LAST_AUTHORIZATION.get()).isNull();
    }

    @Test
    void rejectsTokenWithoutRequiredGlobalRole() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("GUEST"));

        this.mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
        this.mockMvc
                .perform(post("/api/v1/users").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isForbidden());
        this.mockMvc
                .perform(patch("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(
                post("/api/v1/web/events/event-1/registrations").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(
                delete("/api/v1/web/registrations/registration-1").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
        assertThat(LAST_AUTHORIZATION.get()).isNull();
    }

    @Test
    void deniesUnmappedRoutesAndMethods() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));

        this.mockMvc.perform(post("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(get("/api/v1/users").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(delete("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(patch("/api/v1/web/events").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(patch("/api/v1/web/opportunities").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isForbidden());
        assertThat(LAST_AUTHORIZATION.get()).isNull();
    }

    @Test
    void forwardsGetApiV1MeToWebBffWithBearerTokenForUserRole() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;

        this.mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value("user-123")).andExpect(jsonPath("$.name").value("Ana Silva"))
                .andExpect(jsonPath("$.institutionalId").value("12345"));

        assertThat(LAST_METHOD.get()).isEqualTo("GET");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/me");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
    }

    @Test
    void forwardsPostApiV1UsersWithBodyAndBearerToken() throws Exception {
        BFF_STATUS.set(201);
        String requestPayload = "{\"name\":\"Ana Silva\",\"institutionalId\":\"12345\","
                + "\"affiliationStatus\":\"STUDENT\",\"academicLevel\":\"UNDERGRADUATE\","
                + "\"course\":\"Computação\",\"department\":\"Tecnologia\",\"interests\":[]}";
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;

        this.mockMvc
                .perform(post("/api/v1/users").header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(requestPayload))
                .andExpect(status().isCreated())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value("user-123")).andExpect(jsonPath("$.institutionalId").value("12345"));

        assertThat(LAST_METHOD.get()).isEqualTo("POST");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/users");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
        assertThat(LAST_REQUEST_BODY.get()).isEqualTo(requestPayload);
    }

    @Test
    void forwardsPatchApiV1MeWithBodyAndBearerToken() throws Exception {
        String updatePayload = "{\"name\":\"Ana Martins\",\"affiliationStatus\":\"ALUMNI\","
                + "\"academicLevel\":\"MASTERS\",\"course\":\"Matemática\","
                + "\"department\":\"DCC\",\"interests\":[\"football\"]}";
        BFF_BODY.set("{\"id\":\"user-123\",\"name\":\"Ana Martins\",\"institutionalId\":\"12345\","
                + "\"affiliationStatus\":\"ALUMNI\",\"academicLevel\":\"MASTERS\","
                + "\"course\":\"Matemática\",\"department\":\"DCC\",\"interests\":[\"football\"]}");
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300),
                List.of("PLATFORM_ADMIN"));
        String authorizationHeader = "Bearer " + token;

        this.mockMvc
                .perform(patch("/api/v1/me").header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(updatePayload))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Ana Martins"))
                .andExpect(jsonPath("$.affiliationStatus").value("ALUMNI"));

        assertThat(LAST_METHOD.get()).isEqualTo("PATCH");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/me");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
        assertThat(LAST_REQUEST_BODY.get()).isEqualTo(updatePayload);
    }

    @Test
    void preservesDownstream404409And503ErrorResponses() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;

        BFF_STATUS.set(404);
        BFF_CONTENT_TYPE.set(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        BFF_BODY.set("{\"status\":404,\"detail\":\"UNIR user not found\"}");
        this.mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("UNIR user not found"));

        BFF_STATUS.set(409);
        BFF_CONTENT_TYPE.set(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        BFF_BODY.set("{\"status\":409,\"detail\":\"Institutional ID already exists\"}");
        this.mockMvc
                .perform(post("/api/v1/users").header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Institutional ID already exists"));

        BFF_STATUS.set(503);
        BFF_CONTENT_TYPE.set(MediaType.APPLICATION_JSON_VALUE);
        BFF_BODY.set("{\"error\":\"Campus unavailable\"}");
        this.mockMvc
                .perform(patch("/api/v1/me").header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.error").value("Campus unavailable"));
    }

    @Test
    void allowsCorsPreflightForGetPostAndPatchFromConfiguredWebOrigin() throws Exception {
        for (String method : List.of("GET", "POST", "PATCH")) {
            String path = "POST".equals(method) ? "/api/v1/users" : "/api/v1/me";
            this.mockMvc
                    .perform(options(path).header(HttpHeaders.ORIGIN, "http://localhost:15173")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, method)
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization, Content-Type"))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:15173"));
        }
    }

    @Test
    void forwardsEventListAndDetailToWebBffWithUserBearerToken() throws Exception {
        String eventId = "10000000-0000-4000-8000-000000000001";
        String eventJson = "{\"id\":\"" + eventId + "\",\"title\":\"Encontro UNIR\","
                + "\"description\":\"Evento persistido\",\"organizerType\":\"UNIVERSITY\","
                + "\"organizerId\":\"20000000-0000-4000-8000-000000000001\","
                + "\"location\":\"Auditório Central\",\"startsAt\":\"2027-06-15T17:00:00Z\","
                + "\"endsAt\":\"2027-06-15T19:00:00Z\",\"category\":\"ACADEMIC\",\"capacity\":120,"
                + "\"registrationDeadline\":\"2027-06-14T23:59:00Z\","
                + "\"registrationMode\":\"INTERNAL_FREE\",\"price\":null,\"externalUrl\":null,"
                + "\"attendanceEnabled\":true,\"attendanceMode\":\"PARTICIPANT_SCANS_EVENT\","
                + "\"status\":\"ACTIVE\",\"createdAt\":\"2027-01-15T12:00:00Z\"}";
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;
        BFF_BODY.set(
                "{\"items\":[" + eventJson + "],\"page\":0,\"size\":10,\"totalElements\":1," + "\"totalPages\":1}");

        this.mockMvc
                .perform(
                        get("/api/v1/web/events?page=0&size=10").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(eventId))
                .andExpect(jsonPath("$.items[0].title").value("Encontro UNIR"));
        assertThat(LAST_METHOD.get()).isEqualTo("GET");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/events");
        assertThat(LAST_QUERY.get()).isEqualTo("page=0&size=10");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set(eventJson);
        this.mockMvc.perform(
                get("/api/v1/web/events/{eventId}", eventId).header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(eventId));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/events/" + eventId);
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
    }

    @Test
    void forwardsAuthenticatedRagQueryToWebBffAndDoesNotExposeInternalRagRoutes() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;
        String requestBody = "{\"question\":\"Quais eventos de software?\",\"top_k\":3}";
        BFF_BODY.set("{\"mode\":\"fallback\",\"sources\":[{\"record_id\":\"event-1\"}]}");

        this.mockMvc
                .perform(post("/api/v1/web/rag/query").header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(requestBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.sources[0].record_id").value("event-1"));

        assertThat(LAST_METHOD.get()).isEqualTo("POST");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/rag/query");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
        assertThat(LAST_REQUEST_BODY.get()).isEqualTo(requestBody);

        this.mockMvc.perform(post("/api/v1/rag/ingest").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(post("/api/v1/web/rag/ingest").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isForbidden());
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/rag/query");
    }

    @Test
    void forwardsOpportunityListAndDetailToWebBffWithUserBearerToken() throws Exception {
        String opportunityId = "10000000-0000-4000-8000-000000000009";
        String opportunityJson = "{\"id\":\"" + opportunityId + "\",\"title\":\"Estágio em software\","
                + "\"description\":\"Vaga intermediada pelo departamento\",\"publisherType\":\"DEPARTMENT\","
                + "\"publisherId\":\"20000000-0000-4000-8000-000000000001\",\"category\":\"ESTAGIO\","
                + "\"deadline\":\"2027-06-30T23:59:00Z\",\"externalUrl\":\"https://example.org/apply\","
                + "\"imageUrl\":null,\"createdAt\":\"2027-01-15T12:00:00Z\",\"status\":\"ACTIVE\"}";
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;
        String query = "page=0&size=10&category=ESTAGIO&publisherType=DEPARTMENT&q=software";
        BFF_BODY.set("{\"items\":[" + opportunityJson + "],\"page\":0,\"size\":10,"
                + "\"totalElements\":1,\"totalPages\":1}");

        this.mockMvc
                .perform(get("/api/v1/web/opportunities?" + query).header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(opportunityId))
                .andExpect(jsonPath("$.items[0].publisherType").value("DEPARTMENT"));
        assertThat(LAST_METHOD.get()).isEqualTo("GET");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/opportunities");
        assertThat(UriComponentsBuilder.fromUriString("http://localhost/?" + LAST_QUERY.get()).build().getQueryParams()
                .toSingleValueMap())
                .isEqualTo(Map.of("page", "0", "size", "10", "category", "ESTAGIO", "publisherType", "DEPARTMENT", "q",
                        "software"));
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set(opportunityJson);
        this.mockMvc
                .perform(get("/api/v1/web/opportunities/{opportunityId}", opportunityId)
                        .header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(opportunityId))
                .andExpect(jsonPath("$.externalUrl").value("https://example.org/apply"));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/opportunities/" + opportunityId);
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

    }

    @Test
    void forwardsOpportunityPublicationAndFacultyVerificationRoutesToWebBff() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;
        String opportunity = "{\"id\":\"10000000-0000-4000-8000-000000000009\",\"title\":\"Vaga\"}";
        String requestBody = "{\"title\":\"Vaga\",\"publisherType\":\"DEPARTMENT\"}";

        BFF_STATUS.set(201);
        BFF_BODY.set(opportunity);
        this.mockMvc
                .perform(post("/api/v1/web/opportunities").header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("10000000-0000-4000-8000-000000000009"));
        assertThat(LAST_METHOD.get()).isEqualTo("POST");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/opportunities");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
        assertThat(LAST_REQUEST_BODY.get()).isEqualTo(requestBody);

        BFF_STATUS.set(200);
        BFF_BODY.set("{\"items\":[{\"publisherType\":\"DEPARTMENT\"}]}");
        this.mockMvc
                .perform(get("/api/v1/web/opportunities/publisher-contexts").header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].publisherType").value("DEPARTMENT"));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/opportunities/publisher-contexts");

        BFF_BODY.set("{\"id\":\"request-1\",\"status\":\"PENDING\"}");
        this.mockMvc.perform(post("/api/v1/web/professor-verification-requests")
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader).contentType(MediaType.APPLICATION_JSON)
                .content("{\"departmentId\":\"department-1\"}")).andExpect(status().isOk());
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/professor-verification-requests");
        assertThat(LAST_REQUEST_BODY.get()).isEqualTo("{\"departmentId\":\"department-1\"}");

        BFF_BODY.set("{\"items\":[{\"id\":\"request-1\",\"status\":\"PENDING\"}]}");
        this.mockMvc
                .perform(get("/api/v1/web/professor-verification-requests/me").header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].status").value("PENDING"));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/professor-verification-requests/me");

        this.mockMvc.perform(get("/api/v1/web/departments/department-1/professor-verification-requests")
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader)).andExpect(status().isOk());
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/departments/department-1/professor-verification-requests");

        this.mockMvc.perform(post("/api/v1/web/professor-verification-requests/request-1/approve")
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader)).andExpect(status().isOk());
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/professor-verification-requests/request-1/approve");

        this.mockMvc.perform(post("/api/v1/web/professor-verification-requests/request-1/reject")
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader)).andExpect(status().isOk());
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/professor-verification-requests/request-1/reject");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
    }

    @Test
    void forwardsCampusSocialAndContextualRequestRoutesToWebBff() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;
        String postBody = "{\"body\":\"Aviso do semestre\"}";

        this.mockMvc.perform(
                get("/api/v1/web/feed").param("term", "2026/2").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk());
        assertThat(LAST_METHOD.get()).isEqualTo("GET");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/feed");
        assertThat(LAST_QUERY.get()).isEqualTo("term=2026%2F2");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        this.mockMvc.perform(post("/api/v1/web/profiles/DEPARTMENT/department-1/posts")
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader).contentType(MediaType.APPLICATION_JSON)
                .content(postBody)).andExpect(status().isOk());
        assertThat(LAST_METHOD.get()).isEqualTo("POST");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/profiles/DEPARTMENT/department-1/posts");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
        assertThat(LAST_REQUEST_BODY.get()).isEqualTo(postBody);

        this.mockMvc.perform(
                post("/api/v1/web/requests/request-1/approve").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk());
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/requests/request-1/approve");

        this.mockMvc
                .perform(delete("/api/v1/web/follows/follow-1").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk());
        assertThat(LAST_METHOD.get()).isEqualTo("DELETE");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/follows/follow-1");

        this.mockMvc.perform(get("/api/v1/web/notifications").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk());
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/notifications");
    }

    @Test
    void protectsCampusSocialRoutesWithTheUserRole() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("GUEST"));
        String authorizationHeader = "Bearer " + token;

        this.mockMvc.perform(get("/api/v1/web/feed").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isForbidden());
        this.mockMvc.perform(post("/api/v1/web/requests").header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        this.mockMvc
                .perform(delete("/api/v1/web/follows/follow-1").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isForbidden());
        assertThat(LAST_AUTHORIZATION.get()).isNull();
    }

    @Test
    void forwardsSportsCatalogReadsToWebBffAndKeepsWritesDenied() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;
        BFF_BODY.set("{\"items\":[],\"page\":0,\"size\":10,\"totalElements\":0,\"totalPages\":0}");

        this.mockMvc
                .perform(get("/api/v1/web/sports?page=0&size=10&q=futsal").header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/sports");
        assertThat(LAST_QUERY.get()).isEqualTo("page=0&size=10&q=futsal");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        for (String path : List.of("/api/v1/web/sports/40000000-0000-4000-8000-000000000001",
                "/api/v1/web/competitions?targetTeamCount=16",
                "/api/v1/web/competitions/40000000-0000-4000-8000-000000000002",
                "/api/v1/web/seasons?targetTeamCount=10", "/api/v1/web/seasons/40000000-0000-4000-8000-000000000003")) {
            this.mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                    .andExpect(status().isOk());
            assertThat(LAST_PATH.get()).isEqualTo(path.split("\\?")[0]);
            assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
        }

        this.mockMvc.perform(post("/api/v1/web/sports").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isForbidden());
    }

    @Test
    void forwardsRegistrationCreationListingAndCancellationToWebBffWithBearerToken() throws Exception {
        String eventId = "10000000-0000-4000-8000-000000000001";
        String registrationId = "30000000-0000-4000-8000-000000000001";
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;
        BFF_BODY.set("{\"id\":\"" + registrationId + "\",\"eventId\":\"" + eventId + "\",\"status\":\"CONFIRMED\"}");
        BFF_STATUS.set(201);

        this.mockMvc
                .perform(post("/api/v1/web/events/{eventId}/registrations", eventId).header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CONFIRMED"));
        assertThat(LAST_METHOD.get()).isEqualTo("POST");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/events/" + eventId + "/registrations");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_STATUS.set(409);
        BFF_CONTENT_TYPE.set(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        BFF_BODY.set("{\"status\":409,\"detail\":\"ALREADY_REGISTERED\"}");
        this.mockMvc
                .perform(post("/api/v1/web/events/{eventId}/registrations", eventId).header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("ALREADY_REGISTERED"));

        BFF_STATUS.set(200);
        BFF_BODY.set("{\"items\":[{\"id\":\"" + registrationId + "\",\"status\":\"CONFIRMED\"}],"
                + "\"page\":0,\"size\":20,\"totalElements\":1,\"totalPages\":1}");
        this.mockMvc
                .perform(get("/api/v1/web/me/activities?page=0&size=20").header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(registrationId));
        assertThat(LAST_METHOD.get()).isEqualTo("GET");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/me/activities");
        assertThat(LAST_QUERY.get()).isEqualTo("page=0&size=20");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set("{\"id\":\"" + registrationId + "\",\"status\":\"CANCELLED_BY_USER\"}");
        this.mockMvc
                .perform(delete("/api/v1/web/registrations/{registrationId}", registrationId)
                        .header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED_BY_USER"));
        assertThat(LAST_METHOD.get()).isEqualTo("DELETE");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/registrations/" + registrationId);
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
    }

    @Test
    void forwardsAttendanceQueriesAndCheckInToWebBffWithUserBearerToken() throws Exception {
        String eventId = "10000000-0000-4000-8000-000000000001";
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;

        BFF_BODY.set("{\"eventId\":\"" + eventId + "\",\"status\":\"ELIGIBLE\",\"checkedAt\":null}");
        this.mockMvc
                .perform(get("/api/v1/web/attendance/me?eventId=" + eventId).header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ELIGIBLE"));
        assertThat(LAST_METHOD.get()).isEqualTo("GET");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/attendance/me");
        assertThat(LAST_QUERY.get()).isEqualTo("eventId=" + eventId);
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set("{\"checkInId\":\"check-in-1\",\"status\":\"ATTENDED\"}");
        this.mockMvc
                .perform(post("/api/v1/web/attendance/check-ins").header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"opaque-token\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ATTENDED"));
        assertThat(LAST_METHOD.get()).isEqualTo("POST");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/attendance/check-ins");
        assertThat(LAST_REQUEST_BODY.get()).isEqualTo("{\"token\":\"opaque-token\"}");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set("{\"items\":[]}");
        this.mockMvc.perform(get("/api/v1/web/me/tickets").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isArray());
        assertThat(LAST_METHOD.get()).isEqualTo("GET");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/me/tickets");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set("{\"token\":\"opaque-token\",\"qrSvg\":\"<svg/>\"}");
        this.mockMvc.perform(post("/api/v1/web/attendance/tickets/{eventId}/qr", eventId)
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader)).andExpect(status().isOk())
                .andExpect(jsonPath("$.qrSvg").value("<svg/>"));
        assertThat(LAST_METHOD.get()).isEqualTo("POST");
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/attendance/tickets/" + eventId + "/qr");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        String guest = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("GUEST"));
        this.mockMvc
                .perform(post("/api/v1/web/attendance/check-ins").header(HttpHeaders.AUTHORIZATION, "Bearer " + guest)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"opaque-token\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void forwardsUniversityAndDepartmentQueriesToWebBffWithUserBearerToken() throws Exception {
        String departmentId = "10000000-0000-4000-8000-000000000001";
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;

        BFF_BODY.set("{\"id\":\"university-1\",\"acronym\":\"UFRJ\"}");
        this.mockMvc.perform(get("/api/v1/web/university").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.acronym").value("UFRJ"));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/university");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set("{\"items\":[{\"id\":\"semester-1\",\"name\":\"2026/2\","
                + "\"startOn\":\"2026-08-01\",\"endOn\":\"2026-12-20\"}],"
                + "\"page\":0,\"size\":100,\"totalElements\":1,\"totalPages\":1}");
        this.mockMvc
                .perform(get("/api/v1/web/semesters?page=0&size=100").header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].name").value("2026/2"));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/semesters");
        assertThat(LAST_QUERY.get().split("&")).containsExactlyInAnyOrder("page=0", "size=100");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set("{\"items\":[{\"id\":\"" + departmentId + "\",\"acronym\":\"DCC\"}],"
                + "\"page\":0,\"size\":20,\"totalElements\":1,\"totalPages\":1}");
        this.mockMvc
                .perform(get("/api/v1/web/departments?page=0&size=20&sort=name").header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(departmentId))
                .andExpect(jsonPath("$.items[0].acronym").value("DCC"));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/departments");
        assertThat(LAST_QUERY.get().split("&")).containsExactlyInAnyOrder("page=0", "size=20", "sort=name");

        BFF_BODY.set("{\"id\":\"" + departmentId + "\",\"acronym\":\"DCC\"}");
        this.mockMvc
                .perform(get("/api/v1/web/departments/{departmentId}", departmentId).header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(departmentId));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/departments/" + departmentId);
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
    }

    @Test
    void forwardsAcademicCatalogQueriesToWebBffForUsers() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;

        BFF_BODY.set("{\"items\":[{\"id\":\"unit-1\",\"code\":\"ICET\"}],"
                + "\"page\":0,\"size\":100,\"totalElements\":1,\"totalPages\":1}");
        this.mockMvc
                .perform(get("/api/v1/web/academic-units?page=0&size=100&sort=name").header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].code").value("ICET"));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/academic-units");
        assertThat(LAST_QUERY.get().split("&")).containsExactlyInAnyOrder("page=0", "size=100", "sort=name");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set("{\"items\":[{\"id\":\"course-1\",\"name\":\"Sistemas de Informação\"}],"
                + "\"page\":0,\"size\":100,\"totalElements\":1,\"totalPages\":1}");
        this.mockMvc
                .perform(get("/api/v1/web/courses?page=0&size=100&sort=name&academicUnitId=unit-1")
                        .header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].name").value("Sistemas de Informação"));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/courses");
        assertThat(LAST_QUERY.get().split("&")).containsExactlyInAnyOrder("page=0", "size=100", "sort=name",
                "academicUnitId=unit-1");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set("{\"id\":\"course-1\",\"name\":\"Sistemas de Informação\"}");
        this.mockMvc.perform(get("/api/v1/web/courses/{courseId}", "course-1").header(HttpHeaders.AUTHORIZATION,
                authorizationHeader)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value("course-1"));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/courses/course-1");
    }

    @Test
    void forwardsAcademicEntityAndCommunityQueriesToWebBffForUsers() throws Exception {
        String entityId = "10000000-0000-4000-8000-000000000101";
        String communityId = "10000000-0000-4000-8000-000000000201";
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        String authorizationHeader = "Bearer " + token;

        BFF_BODY.set("{\"items\":[{\"id\":\"" + entityId + "\",\"entityType\":\"Demonstração\"}],"
                + "\"page\":0,\"size\":20,\"totalElements\":1,\"totalPages\":1}");
        this.mockMvc
                .perform(get("/api/v1/web/entities?page=0&size=20&sort=name").header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(entityId));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/entities");
        assertThat(LAST_QUERY.get().split("&")).containsExactlyInAnyOrder("page=0", "size=20", "sort=name");
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        BFF_BODY.set("{\"id\":\"" + entityId + "\",\"entityType\":\"Demonstração\"}");
        this.mockMvc.perform(
                get("/api/v1/web/entities/{entityId}", entityId).header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(entityId));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/entities/" + entityId);

        BFF_BODY.set("{\"items\":[{\"id\":\"" + communityId + "\",\"name\":\"Comunidade de Demonstração\"}],"
                + "\"page\":0,\"size\":20,\"totalElements\":1,\"totalPages\":1}");
        this.mockMvc
                .perform(get("/api/v1/web/communities?page=0&size=20&sort=name").header(HttpHeaders.AUTHORIZATION,
                        authorizationHeader))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(communityId));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/communities");

        BFF_BODY.set("{\"id\":\"" + communityId + "\",\"name\":\"Comunidade de Demonstração\"}");
        this.mockMvc.perform(get("/api/v1/web/communities/{communityId}", communityId).header(HttpHeaders.AUTHORIZATION,
                authorizationHeader)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(communityId));
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/communities/" + communityId);
        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);

        String guestToken = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("GUEST"));
        this.mockMvc.perform(get("/api/v1/web/entities").header(HttpHeaders.AUTHORIZATION, "Bearer " + guestToken))
                .andExpect(status().isForbidden());
        assertThat(LAST_PATH.get()).isEqualTo("/api/v1/web/communities/" + communityId);
    }

    @Test
    void allowsCorsPreflightForEventQueriesFromConfiguredWebOrigin() throws Exception {
        for (String path : List.of("/api/v1/web/events", "/api/v1/web/events/10000000-0000-4000-8000-000000000001")) {
            this.mockMvc
                    .perform(options(path).header(HttpHeaders.ORIGIN, "http://localhost:15173")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization"))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:15173"));
        }
    }

    @Test
    void allowsCorsPreflightForAttendanceFromConfiguredWebOrigin() throws Exception {
        List<Map.Entry<String, String>> requests = List.of(
                Map.entry("/api/v1/web/attendance/me?eventId=10000000-0000-4000-8000-000000000001", "GET"),
                Map.entry("/api/v1/web/attendance/check-ins", "POST"), Map.entry("/api/v1/web/me/tickets", "GET"),
                Map.entry("/api/v1/web/attendance/events/10000000-0000-4000-8000-000000000001/qr", "POST"),
                Map.entry("/api/v1/web/attendance/tickets/10000000-0000-4000-8000-000000000001/qr", "POST"),
                Map.entry("/api/v1/web/attendance/organizer-check-ins/preview", "POST"),
                Map.entry("/api/v1/web/attendance/organizer-check-ins/confirm", "POST"));
        for (Map.Entry<String, String> request : requests) {
            this.mockMvc
                    .perform(options(request.getKey()).header(HttpHeaders.ORIGIN, "http://localhost:15173")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, request.getValue())
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization, Content-Type"))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:15173"));
        }
    }

    @Test
    void allowsCorsPreflightForRegistrationOperationsFromConfiguredWebOrigin() throws Exception {
        List<Map.Entry<String, String>> requests = List.of(
                Map.entry("/api/v1/web/events/10000000-0000-4000-8000-000000000001/registrations", "POST"),
                Map.entry("/api/v1/web/me/activities", "GET"),
                Map.entry("/api/v1/web/registrations/30000000-0000-4000-8000-000000000001", "DELETE"));
        for (Map.Entry<String, String> request : requests) {
            this.mockMvc
                    .perform(options(request.getKey()).header(HttpHeaders.ORIGIN, "http://localhost:15173")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, request.getValue())
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization"))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:15173"));
        }
    }

    @Test
    void allowsCorsPreflightForUniversityAndDepartmentQueriesFromConfiguredWebOrigin() throws Exception {
        for (String path : List.of("/api/v1/web/university", "/api/v1/web/semesters", "/api/v1/web/academic-units",
                "/api/v1/web/courses", "/api/v1/web/departments",
                "/api/v1/web/departments/10000000-0000-4000-8000-000000000001", "/api/v1/web/entities",
                "/api/v1/web/entities/entity-1", "/api/v1/web/communities", "/api/v1/web/communities/community-1",
                "/api/v1/web/opportunities", "/api/v1/web/opportunities/10000000-0000-4000-8000-000000000009")) {
            this.mockMvc
                    .perform(options(path).header(HttpHeaders.ORIGIN, "http://localhost:15173")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization"))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:15173"));
        }
    }

    @Test
    void rejectsAdminMeForCommonUserWith403AndForwardsForPlatformAdminToAdminBff() throws Exception {
        String userToken = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));
        this.mockMvc.perform(get("/api/v1/admin/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken))
                .andExpect(status().isForbidden());
        assertThat(LAST_ADMIN_AUTHORIZATION.get()).isNull();

        String adminToken = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300),
                List.of("USER", "PLATFORM_ADMIN"));
        String authorizationHeader = "Bearer " + adminToken;
        this.mockMvc.perform(get("/api/v1/admin/me").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value("user-123")).andExpect(jsonPath("$.name").value("Ana Silva"))
                .andExpect(jsonPath("$.institutionalId").value("12345"));

        assertThat(LAST_ADMIN_METHOD.get()).isEqualTo("GET");
        assertThat(LAST_ADMIN_PATH.get()).isEqualTo("/api/v1/admin/me");
        assertThat(LAST_ADMIN_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
    }

    @Test
    void allowsCorsPreflightForAdminMeFromConfiguredAdminWebOrigin() throws Exception {
        this.mockMvc
                .perform(options("/api/v1/admin/me").header(HttpHeaders.ORIGIN, "http://localhost:15175")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization, Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:15175"));
    }

    @Test
    void allowsAdminWebOriginOnlyForReadOnlyCampusOverviewQueries() throws Exception {
        for (String path : List.of("/api/v1/web/university", "/api/v1/web/departments", "/api/v1/web/entities",
                "/api/v1/web/communities")) {
            this.mockMvc
                    .perform(options(path).header(HttpHeaders.ORIGIN, "http://localhost:15175")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization"))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:15175"));
        }

        this.mockMvc
                .perform(options("/api/v1/web/opportunities").header(HttpHeaders.ORIGIN, "http://localhost:15175")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization"))
                .andExpect(status().isForbidden());
        this.mockMvc
                .perform(options("/api/v1/web/opportunities").header(HttpHeaders.ORIGIN, "http://localhost:15175")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization, Content-Type"))
                .andExpect(status().isForbidden());
    }

    private static String expectedIssuer() {
        return "http://127.0.0.1:" + KEYCLOAK_SERVER.getAddress().getPort() + ISSUER_PATH;
    }

    private static RSAKey generateRsaJwk(String keyId) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair keyPair = generator.generateKeyPair();
        return new RSAKey.Builder((RSAPublicKey) keyPair.getPublic()).privateKey((RSAPrivateKey) keyPair.getPrivate())
                .keyID(keyId).algorithm(JWSAlgorithm.RS256).build();
    }

    private static String signToken(RSAKey rsaKey, String issuer, Instant expirationTime, List<String> roles)
            throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder().subject("user-123").issuer(issuer)
                .issueTime(Date.from(expirationTime.minusSeconds(60))).expirationTime(Date.from(expirationTime))
                .claim("realm_access", Map.of("roles", roles)).build();
        JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(rsaKey.getKeyID()).type(JOSEObjectType.JWT)
                .build();
        SignedJWT signedJwt = new SignedJWT(header, claims);
        signedJwt.sign(new RSASSASigner(rsaKey.toPrivateKey()));
        return signedJwt.serialize();
    }

    private static HttpServer startKeycloakServer() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        String jwksJson = new JWKSet(VALID_JWK.toPublicJWK()).toString();
        server.createContext(JWKS_PATH,
                exchange -> respondJson(exchange, 200, MediaType.APPLICATION_JSON_VALUE, jwksJson));
        server.start();
        return server;
    }

    private static HttpServer startWebBffServer() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1", exchange -> {
            LAST_METHOD.set(exchange.getRequestMethod());
            LAST_PATH.set(exchange.getRequestURI().getPath());
            LAST_QUERY.set(exchange.getRequestURI().getRawQuery());
            LAST_AUTHORIZATION.set(exchange.getRequestHeaders().getFirst(HttpHeaders.AUTHORIZATION));
            LAST_REQUEST_BODY.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respondJson(exchange, BFF_STATUS.get(), BFF_CONTENT_TYPE.get(), BFF_BODY.get());
        });
        server.start();
        return server;
    }

    private static HttpServer startAdminBffServer() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/admin/me", exchange -> {
            LAST_ADMIN_METHOD.set(exchange.getRequestMethod());
            LAST_ADMIN_PATH.set(exchange.getRequestURI().getPath());
            LAST_ADMIN_AUTHORIZATION.set(exchange.getRequestHeaders().getFirst(HttpHeaders.AUTHORIZATION));
            respondJson(exchange, BFF_STATUS.get(), BFF_CONTENT_TYPE.get(), BFF_BODY.get());
        });
        server.start();
        return server;
    }

    private static void respondJson(HttpExchange exchange, int status, String contentType, String body)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, contentType);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }
}

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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

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
    private static final AtomicReference<String> LAST_METHOD = new AtomicReference<>();
    private static final AtomicReference<String> LAST_PATH = new AtomicReference<>();
    private static final AtomicReference<String> LAST_AUTHORIZATION = new AtomicReference<>();
    private static final AtomicReference<String> LAST_REQUEST_BODY = new AtomicReference<>();
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
        registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri",
                () -> "http://127.0.0.1:" + keycloakPort + ISSUER_PATH);
        registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri",
                () -> "http://127.0.0.1:" + keycloakPort + JWKS_PATH);
        registry.add("WEB_BFF_URL", () -> "http://127.0.0.1:" + webBffPort);
    }

    @AfterAll
    static void stopServers() {
        KEYCLOAK_SERVER.stop(0);
        WEB_BFF_SERVER.stop(0);
    }

    @BeforeEach
    void resetBffState() {
        LAST_METHOD.set(null);
        LAST_PATH.set(null);
        LAST_AUTHORIZATION.set(null);
        LAST_REQUEST_BODY.set(null);
        BFF_STATUS.set(200);
        BFF_CONTENT_TYPE.set(MediaType.APPLICATION_JSON_VALUE);
        BFF_BODY.set(PROFILE_JSON);
    }

    @Test
    void rejectsRequestsWithoutBearerToken() throws Exception {
        this.mockMvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
        this.mockMvc.perform(post("/api/v1/users").contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isUnauthorized());
        this.mockMvc.perform(patch("/api/v1/me").contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isUnauthorized());
        assertThat(LAST_AUTHORIZATION.get()).isNull();
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
        BFF_BODY.set("{\"error\":\"User Service unavailable\"}");
        this.mockMvc
                .perform(patch("/api/v1/me").header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                        .contentType(MediaType.APPLICATION_JSON).content(PROFILE_JSON))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("User Service unavailable"));
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
            LAST_AUTHORIZATION.set(exchange.getRequestHeaders().getFirst(HttpHeaders.AUTHORIZATION));
            LAST_REQUEST_BODY.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
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

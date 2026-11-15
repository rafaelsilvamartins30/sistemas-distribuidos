package br.unir.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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

    private static final RSAKey VALID_JWK;
    private static final RSAKey OTHER_JWK;
    private static final HttpServer KEYCLOAK_SERVER;
    private static final HttpServer WEB_BFF_SERVER;
    private static final AtomicReference<String> LAST_AUTHORIZATION = new AtomicReference<>();
    private static final AtomicReference<Integer> BFF_STATUS = new AtomicReference<>(200);
    private static final AtomicReference<String> BFF_BODY = new AtomicReference<>(
            "{\"id\":\"user-123\",\"name\":\"Ana Silva\"}");

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
        LAST_AUTHORIZATION.set(null);
        BFF_STATUS.set(200);
        BFF_BODY.set("{\"id\":\"user-123\",\"name\":\"Ana Silva\"}");
    }

    @Test
    void rejectsRequestWithoutBearerToken() throws Exception {
        this.mockMvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
        assertThat(LAST_AUTHORIZATION.get()).isNull();
    }

    @Test
    void rejectsTokenWithInvalidSignature() throws Exception {
        String token = signToken(OTHER_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));

        this.mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
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
        assertThat(LAST_AUTHORIZATION.get()).isNull();
    }

    @Test
    void deniesUnmappedRoutesAndMethods() throws Exception {
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300), List.of("USER"));

        this.mockMvc.perform(post("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
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
                .andExpect(jsonPath("$.id").value("user-123")).andExpect(jsonPath("$.name").value("Ana Silva"));

        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
    }

    @Test
    void forwardsGetApiV1MeToWebBffForPlatformAdminRoleAndPreservesDownstreamStatus() throws Exception {
        BFF_STATUS.set(404);
        BFF_BODY.set("{\"status\":404,\"detail\":\"UNIR user not found\"}");
        String token = signToken(VALID_JWK, expectedIssuer(), Instant.now().plusSeconds(300),
                List.of("PLATFORM_ADMIN"));
        String authorizationHeader = "Bearer " + token;

        this.mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, authorizationHeader))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("UNIR user not found"));

        assertThat(LAST_AUTHORIZATION.get()).isEqualTo(authorizationHeader);
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
        server.createContext(JWKS_PATH, exchange -> respondJson(exchange, 200, jwksJson));
        server.start();
        return server;
    }

    private static HttpServer startWebBffServer() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/me", exchange -> {
            if (!"GET".equals(exchange.getRequestMethod())) {
                respondJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
                return;
            }
            LAST_AUTHORIZATION.set(exchange.getRequestHeaders().getFirst(HttpHeaders.AUTHORIZATION));
            respondJson(exchange, BFF_STATUS.get(), BFF_BODY.get());
        });
        server.start();
        return server;
    }

    private static void respondJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }
}

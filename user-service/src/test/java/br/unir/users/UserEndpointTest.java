package br.unir.users;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.unir.users.entity.User;
import br.unir.users.repository.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
class UserEndpointTest {

    private static final String USER_ID = "8e9bc9d3-b6e7-4ef3-a50b-d8ca9fd03767";
    private static final String OTHER_USER_ID = "2072aef7-993e-4fde-8567-85949b914dbc";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @BeforeEach
    void clearUsers() {
        this.userRepository.deleteAll();
    }

    @Test
    void endpointsRequireJwt() throws Exception {
        this.mockMvc
                .perform(post("/users").contentType(MediaType.APPLICATION_JSON)
                        .content(this.objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isUnauthorized());
        this.mockMvc.perform(get("/users/me")).andExpect(status().isUnauthorized());
        this.mockMvc
                .perform(patch("/users/me").contentType(MediaType.APPLICATION_JSON)
                        .content(this.objectMapper.writeValueAsString(validUpdate())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void createsUserWithLiteralSubjectAndRequestName() throws Exception {
        String subject = "Keycloak-Subject-123";
        this.mockMvc
                .perform(post("/users").with(userJwt(subject, "ana@unir.br")).contentType(MediaType.APPLICATION_JSON)
                        .content(this.objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(subject))
                .andExpect(jsonPath("$.name").value("Ana Silva"))
                .andExpect(jsonPath("$.institutionalId").value("12345"))
                .andExpect(jsonPath("$.interests[0]").value("Sistemas distribuídos"))
                .andExpect(jsonPath("$.createdAt").isNotEmpty()).andExpect(jsonPath("$.updatedAt").isNotEmpty())
                .andExpect(jsonPath("$.email").doesNotExist());
        assertThat(this.userRepository.findById(subject).orElseThrow().getName()).isEqualTo("Ana Silva");
    }

    @Test
    void requestCannotControlIdentityFields() throws Exception {
        Map<String, Object> request = validRequest();
        request.put("id", OTHER_USER_ID);
        request.put("email", "spoofed@example.com");
        request.put("role", "PLATFORM_ADMIN");
        request.put("password", "secret");

        this.mockMvc.perform(post("/users").with(userJwt(USER_ID, "ana@unir.br"))
                .contentType(MediaType.APPLICATION_JSON).content(this.objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
        assertThat(this.userRepository.count()).isZero();
        assertThat(this.userRepository.existsById(OTHER_USER_ID)).isFalse();
    }

    @Test
    void rejectsDuplicateSubject() throws Exception {
        createUser(USER_ID, "12345");
        Map<String, Object> request = validRequest();
        request.put("institutionalId", "67890");
        this.mockMvc
                .perform(post("/users").with(userJwt(USER_ID, "changed@unir.br"))
                        .contentType(MediaType.APPLICATION_JSON).content(this.objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("User already exists"));
        assertThat(this.userRepository.count()).isEqualTo(1);
    }

    @Test
    void rejectsDuplicateInstitutionalId() throws Exception {
        createUser(USER_ID, "12345");
        this.mockMvc
                .perform(post("/users").with(userJwt(OTHER_USER_ID, "other@unir.br"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(this.objectMapper.writeValueAsString(validRequest())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Institutional ID already exists"));
    }

    @Test
    void assignedIdCannotOverwriteExistingUser() throws Exception {
        createUser(USER_ID, "12345");
        User duplicate = new User(USER_ID, "Changed name", "67890", "Other course", "Other department", List.of());
        assertThatThrownBy(() -> this.userRepository.saveAndFlush(duplicate))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(this.userRepository.findById(USER_ID).orElseThrow().getName()).isEqualTo("Ana Silva");
    }

    @Test
    void getMeUsesSubjectAndReadsEmailFromCurrentJwt() throws Exception {
        createUser(USER_ID, "12345");
        createUser(OTHER_USER_ID, "67890");
        this.mockMvc
                .perform(get("/users/me").with(userJwt(USER_ID, "new-email@unir.br")).param("userId", OTHER_USER_ID))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(USER_ID))
                .andExpect(jsonPath("$.email").value("new-email@unir.br"))
                .andExpect(jsonPath("$.emailVerified").value(true))
                .andExpect(jsonPath("$.institutionalId").value("12345"));
    }

    @Test
    void getMeReturnsNotFoundBeforeProfileCreation() throws Exception {
        this.mockMvc.perform(get("/users/me").with(userJwt(USER_ID, "ana@unir.br"))).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("UNIR user not found"));
    }

    @Test
    void patchMeChangesOnlyEditableFields() throws Exception {
        createUser(USER_ID, "12345");
        Map<String, Object> update = validUpdate();
        this.mockMvc
                .perform(patch("/users/me").with(userJwt(USER_ID, "ana@unir.br"))
                        .contentType(MediaType.APPLICATION_JSON).content(this.objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(USER_ID))
                .andExpect(jsonPath("$.name").value("Ana Martins")).andExpect(jsonPath("$.course").value("Matemática"))
                .andExpect(jsonPath("$.department").value("DCC"))
                .andExpect(jsonPath("$.interests[0]").value("football"))
                .andExpect(jsonPath("$.institutionalId").value("12345"))
                .andExpect(jsonPath("$.email").value("ana@unir.br"));
        User saved = this.userRepository.findById(USER_ID).orElseThrow();
        assertThat(saved.getName()).isEqualTo("Ana Martins");
        assertThat(saved.getInstitutionalId()).isEqualTo("12345");
        assertThat(this.userRepository.existsById(OTHER_USER_ID)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"id", "institutionalId", "email", "roles", "password"})
    void patchMeRejectsForbiddenFields(String field) throws Exception {
        createUser(USER_ID, "12345");
        Map<String, Object> update = validUpdate();
        update.put(field, "changed");
        this.mockMvc
                .perform(patch("/users/me").with(userJwt(USER_ID, "ana@unir.br"))
                        .contentType(MediaType.APPLICATION_JSON).content(this.objectMapper.writeValueAsString(update)))
                .andExpect(status().isBadRequest());
        assertThat(this.userRepository.findById(USER_ID).orElseThrow().getName()).isEqualTo("Ana Silva");
    }

    @Test
    void patchMeReturnsNotFoundBeforeProfileCreation() throws Exception {
        this.mockMvc
                .perform(
                        patch("/users/me").with(userJwt(USER_ID, "ana@unir.br")).contentType(MediaType.APPLICATION_JSON)
                                .content(this.objectMapper.writeValueAsString(validUpdate())))
                .andExpect(status().isNotFound());
    }

    @Test
    void patchMePreservesOmittedFieldsAndAllowsClearingInterests() throws Exception {
        createUser(USER_ID, "12345");
        this.mockMvc
                .perform(
                        patch("/users/me").with(userJwt(USER_ID, "ana@unir.br")).contentType(MediaType.APPLICATION_JSON)
                                .content(this.objectMapper
                                        .writeValueAsString(Map.of("name", "Ana Martins", "interests", List.of()))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Ana Martins"))
                .andExpect(jsonPath("$.course").value("Computação"))
                .andExpect(jsonPath("$.department").value("Tecnologia")).andExpect(jsonPath("$.interests").isEmpty());
    }

    @Test
    void patchMeRejectsBlankEditableField() throws Exception {
        createUser(USER_ID, "12345");
        this.mockMvc
                .perform(
                        patch("/users/me").with(userJwt(USER_ID, "ana@unir.br")).contentType(MediaType.APPLICATION_JSON)
                                .content(this.objectMapper.writeValueAsString(Map.of("name", " "))))
                .andExpect(status().isBadRequest());
        assertThat(this.userRepository.findById(USER_ID).orElseThrow().getName()).isEqualTo("Ana Silva");
    }

    @Test
    void identityCredentialsAreAbsentFromModelAndDatabase() {
        assertThat(User.class.getDeclaredFields()).extracting("name").doesNotContain("email", "password",
                "passwordHash", "roles");
        List<String> columns = this.jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'", String.class);
        assertThat(columns).doesNotContain("email", "password", "password_hash", "roles");
    }

    @ParameterizedTest
    @ValueSource(strings = {"name", "institutionalId", "course", "department"})
    void rejectsMissingRequiredCreateField(String field) throws Exception {
        Map<String, Object> request = validRequest();
        request.remove(field);
        this.mockMvc
                .perform(post("/users").with(userJwt(USER_ID, "ana@unir.br")).contentType(MediaType.APPLICATION_JSON)
                        .content(this.objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Invalid fields: " + field));
    }

    @ParameterizedTest
    @ValueSource(strings = {"name", "institutionalId", "course", "department"})
    void rejectsBlankRequiredCreateField(String field) throws Exception {
        Map<String, Object> request = validRequest();
        request.put(field, " ");
        this.mockMvc.perform(post("/users").with(userJwt(USER_ID, "ana@unir.br"))
                .contentType(MediaType.APPLICATION_JSON).content(this.objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void acceptsEmptyInterests() throws Exception {
        Map<String, Object> request = validRequest();
        request.remove("interests");
        this.mockMvc
                .perform(post("/users").with(userJwt(USER_ID, "ana@unir.br")).contentType(MediaType.APPLICATION_JSON)
                        .content(this.objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.interests").isEmpty());
    }

    private void createUser(String id, String institutionalId) throws Exception {
        Map<String, Object> request = validRequest();
        request.put("institutionalId", institutionalId);
        this.mockMvc.perform(post("/users").with(userJwt(id, "ana@unir.br")).contentType(MediaType.APPLICATION_JSON)
                .content(this.objectMapper.writeValueAsString(request))).andExpect(status().isCreated());
    }

    private JwtRequestPostProcessor userJwt(String id, String email) {
        return jwt().jwt(token -> token.subject(id).claim("email", email).claim("email_verified", true)
                .claim("realm_access", Map.of("roles", List.of("USER"))));
    }

    private Map<String, Object> validRequest() {
        return new HashMap<>(Map.of("name", "Ana Silva", "institutionalId", "12345", "course", "Computação",
                "department", "Tecnologia", "interests", List.of("Sistemas distribuídos")));
    }

    private Map<String, Object> validUpdate() {
        return new HashMap<>(Map.of("name", "Ana Martins", "course", "Matemática", "department", "DCC", "interests",
                List.of("football")));
    }
}

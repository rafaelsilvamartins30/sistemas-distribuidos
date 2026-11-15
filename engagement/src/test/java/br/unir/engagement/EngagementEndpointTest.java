package br.unir.engagement;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class EngagementEndpointTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void healthEndpointReportsDatabaseConnectivity() throws Exception {
        this.mockMvc.perform(get("/health")).andExpect(status().isOk())
                .andExpect(jsonPath("$.service").value("engagement")).andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.database").value("up"));
    }

    @Test
    void unmappedEndpointsRequireAuthenticationOrAreDenied() throws Exception {
        this.mockMvc.perform(get("/activities")).andExpect(status().isUnauthorized());
    }
}

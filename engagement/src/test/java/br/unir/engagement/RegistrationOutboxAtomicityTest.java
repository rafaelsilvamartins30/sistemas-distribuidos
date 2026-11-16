package br.unir.engagement;

import static org.mockito.ArgumentMatchers.any;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.OutboxEvent;
import br.unir.engagement.entity.RegistrationMode;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.repository.OutboxRepository;
import br.unir.engagement.repository.RegistrationRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class RegistrationOutboxAtomicityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private RegistrationRepository registrationRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private OutboxRepository outboxRepository;

    @BeforeEach
    void clearDatabase() {
        this.jdbcTemplate.update("delete from outbox_events");
        this.registrationRepository.deleteAllInBatch();
        this.eventRepository.deleteAllInBatch();
    }

    @Test
    void outboxFailureRollsBackTheNewRegistration() throws Exception {
        Instant now = Instant.now();
        Instant startsAt = now.plusSeconds(86_400);
        Event event = new Event(UUID.randomUUID(), "Evento pago", "Descrição", "UNIVERSITY", UUID.randomUUID(), null,
                "Auditório", startsAt, startsAt.plusSeconds(3600), "ACADEMIC", 2, startsAt.minusSeconds(60),
                RegistrationMode.INTERNAL_PAID, 2500L, null, false, null, EventStatus.ACTIVE, now);
        this.eventRepository.saveAndFlush(event);
        when(this.outboxRepository.saveAndFlush(any(OutboxEvent.class)))
                .thenThrow(new IllegalStateException("simulated outbox database failure"));

        assertThrows(jakarta.servlet.ServletException.class,
                () -> this.mockMvc.perform(post("/api/v1/events/{eventId}/registrations", event.getId())
                        .with(jwt().jwt(token -> token.subject("keycloak-user"))
                                .authorities(new SimpleGrantedAuthority("ROLE_USER")))));

        org.junit.jupiter.api.Assertions.assertEquals(0, this.registrationRepository.count());
        org.junit.jupiter.api.Assertions.assertEquals(0,
                this.jdbcTemplate.queryForObject("select count(*) from outbox_events", Long.class));
    }
}

package br.unir.engagement.service;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;

import br.unir.engagement.dto.HealthResponse;

@Service
public class EngagementHealthService {

    private final JdbcOperations jdbcOperations;

    public EngagementHealthService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    public HealthResponse checkHealth() {
        Integer result = this.jdbcOperations.queryForObject("SELECT 1", Integer.class);
        String databaseStatus = Integer.valueOf(1).equals(result) ? "up" : "down";
        return new HealthResponse("engagement", "ok", databaseStatus);
    }
}

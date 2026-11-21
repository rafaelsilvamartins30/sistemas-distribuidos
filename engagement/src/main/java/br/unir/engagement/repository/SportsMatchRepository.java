package br.unir.engagement.repository;

import br.unir.engagement.entity.SportsMatch;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SportsMatchRepository extends JpaRepository<SportsMatch, UUID> {

    List<SportsMatch> findByContextTypeAndContextIdOrderByRoundNumberAscScheduledAtAsc(String contextType,
            UUID contextId);

    boolean existsByContextTypeAndContextId(String contextType, UUID contextId);

    @Query("""
            SELECT m FROM SportsMatch m
            WHERE m.homeTeamId IN :teamIds OR m.awayTeamId IN :teamIds
            ORDER BY m.scheduledAt ASC, m.id ASC
            """)
    List<SportsMatch> findByTeamIds(@Param("teamIds") Collection<UUID> teamIds);
}

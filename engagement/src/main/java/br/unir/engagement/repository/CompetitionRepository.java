package br.unir.engagement.repository;

import br.unir.engagement.entity.Competition;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CompetitionRepository extends JpaRepository<Competition, UUID> {

    @EntityGraph(attributePaths = "sport")
    @Query(value = "select c from Competition c join c.sport s "
            + "where (:query = '' or lower(c.title) like lower(concat('%', :query, '%')) "
            + "or lower(s.name) like lower(concat('%', :query, '%'))) " + "and (:sportId is null or s.id = :sportId) "
            + "and (:skillLevel = '' or lower(c.skillLevel) = lower(:skillLevel)) "
            + "and (:organizerType = '' or lower(c.organizerType) = lower(:organizerType)) "
            + "and (:organizerId is null or c.organizerId = :organizerId) "
            + "and (:targetTeamCount is null or c.targetTeamCount = :targetTeamCount) "
            + "order by lower(c.title), c.id", countQuery = "select count(c) from Competition c join c.sport s "
                    + "where (:query = '' or lower(c.title) like lower(concat('%', :query, '%')) "
                    + "or lower(s.name) like lower(concat('%', :query, '%'))) "
                    + "and (:sportId is null or s.id = :sportId) "
                    + "and (:skillLevel = '' or lower(c.skillLevel) = lower(:skillLevel)) "
                    + "and (:organizerType = '' or lower(c.organizerType) = lower(:organizerType)) "
                    + "and (:organizerId is null or c.organizerId = :organizerId) "
                    + "and (:targetTeamCount is null or c.targetTeamCount = :targetTeamCount)")
    Page<Competition> search(@Param("query") String query, @Param("sportId") UUID sportId,
            @Param("skillLevel") String skillLevel, @Param("organizerType") String organizerType,
            @Param("organizerId") UUID organizerId, @Param("targetTeamCount") Integer targetTeamCount,
            Pageable pageable);

    @EntityGraph(attributePaths = "sport")
    Optional<Competition> findById(UUID id);
}

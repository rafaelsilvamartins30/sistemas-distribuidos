package br.unir.engagement.repository;

import br.unir.engagement.entity.Season;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SeasonRepository extends JpaRepository<Season, UUID> {

    @EntityGraph(attributePaths = "sport")
    @Query(value = "select s from Season s join s.sport sp "
            + "where (:query = '' or lower(s.title) like lower(concat('%', :query, '%')) "
            + "or lower(sp.name) like lower(concat('%', :query, '%'))) " + "and (:sportId is null or sp.id = :sportId) "
            + "and (:skillLevel = '' or lower(s.skillLevel) = lower(:skillLevel)) "
            + "and (:organizerType = '' or lower(s.organizerType) = lower(:organizerType)) "
            + "and (:organizerId is null or s.organizerId = :organizerId) "
            + "and (:targetTeamCount is null or s.targetTeamCount = :targetTeamCount) "
            + "order by lower(s.title), s.id", countQuery = "select count(s) from Season s join s.sport sp "
                    + "where (:query = '' or lower(s.title) like lower(concat('%', :query, '%')) "
                    + "or lower(sp.name) like lower(concat('%', :query, '%'))) "
                    + "and (:sportId is null or sp.id = :sportId) "
                    + "and (:skillLevel = '' or lower(s.skillLevel) = lower(:skillLevel)) "
                    + "and (:organizerType = '' or lower(s.organizerType) = lower(:organizerType)) "
                    + "and (:organizerId is null or s.organizerId = :organizerId) "
                    + "and (:targetTeamCount is null or s.targetTeamCount = :targetTeamCount)")
    Page<Season> search(@Param("query") String query, @Param("sportId") UUID sportId,
            @Param("skillLevel") String skillLevel, @Param("organizerType") String organizerType,
            @Param("organizerId") UUID organizerId, @Param("targetTeamCount") Integer targetTeamCount,
            Pageable pageable);

    @EntityGraph(attributePaths = "sport")
    Optional<Season> findById(UUID id);
}

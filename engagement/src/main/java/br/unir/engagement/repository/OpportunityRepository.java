package br.unir.engagement.repository;

import br.unir.engagement.entity.Opportunity;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OpportunityRepository extends JpaRepository<Opportunity, UUID>, JpaSpecificationExecutor<Opportunity> {

    @Query("""
            select opportunity from Opportunity opportunity
            where opportunity.status = :status
              and (opportunity.deadline is null or opportunity.deadline > :now)
              and (:query = '' or lower(opportunity.title) like lower(concat('%', :query, '%'))
                  or lower(opportunity.description) like lower(concat('%', :query, '%'))
                  or lower(opportunity.category) like lower(concat('%', :query, '%')))
              and (:category = '' or lower(opportunity.category) = lower(:category))
              and (:publisherType = '' or opportunity.publisherType = :publisherType)
            """)
    Page<Opportunity> findActive(@Param("status") String status, @Param("now") Instant now,
            @Param("query") String query, @Param("category") String category,
            @Param("publisherType") String publisherType, Pageable pageable);

    Optional<Opportunity> findById(UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Opportunity o where o.id = :id")
    Optional<Opportunity> findByIdForUpdate(@Param("id") UUID id);
}

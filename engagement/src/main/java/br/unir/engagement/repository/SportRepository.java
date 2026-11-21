package br.unir.engagement.repository;

import br.unir.engagement.entity.Sport;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SportRepository extends JpaRepository<Sport, UUID> {

    @Query("select s from Sport s where (:query = '' or lower(s.name) like lower(concat('%', :query, '%'))) "
            + "order by lower(s.name), s.id")
    Page<Sport> search(@Param("query") String query, Pageable pageable);

    Optional<Sport> findById(UUID id);
}

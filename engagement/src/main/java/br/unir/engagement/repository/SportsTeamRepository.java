package br.unir.engagement.repository;

import br.unir.engagement.entity.SportsTeam;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SportsTeamRepository extends JpaRepository<SportsTeam, UUID> {

    List<SportsTeam> findByContextTypeAndContextIdAndStatusOrderByCreatedAtAsc(String contextType, UUID contextId,
            String status);

    List<SportsTeam> findByIdIn(Collection<UUID> ids);
}

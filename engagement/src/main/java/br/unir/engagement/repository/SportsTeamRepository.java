package br.unir.engagement.repository;

import br.unir.engagement.entity.SportsTeam;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SportsTeamRepository extends JpaRepository<SportsTeam, UUID> {

    List<SportsTeam> findByContextTypeAndContextIdAndStatusOrderByCreatedAtAsc(String contextType, UUID contextId,
            String status);

    List<SportsTeam> findByContextTypeAndContextIdAndStatusInOrderByCreatedAtAsc(String contextType, UUID contextId,
            Collection<String> statuses);

    Optional<SportsTeam> findByContextTypeAndContextIdAndInviteCodeIgnoreCase(String contextType, UUID contextId,
            String inviteCode);

    List<SportsTeam> findByIdIn(Collection<UUID> ids);
}

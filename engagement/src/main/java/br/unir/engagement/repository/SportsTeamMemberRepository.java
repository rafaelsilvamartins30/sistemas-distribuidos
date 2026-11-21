package br.unir.engagement.repository;

import br.unir.engagement.entity.SportsTeamMember;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SportsTeamMemberRepository extends JpaRepository<SportsTeamMember, UUID> {

    List<SportsTeamMember> findByTeamIdInOrderByJoinedAtAsc(Collection<UUID> teamIds);

    List<SportsTeamMember> findByUserId(String userId);

    boolean existsByTeamIdAndUserId(UUID teamId, String userId);
}

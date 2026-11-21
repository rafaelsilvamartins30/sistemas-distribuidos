package br.unir.engagement.repository;

import br.unir.engagement.entity.SportsMatchCheckIn;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SportsMatchCheckInRepository extends JpaRepository<SportsMatchCheckIn, UUID> {

    List<SportsMatchCheckIn> findByMatchIdIn(Collection<UUID> matchIds);

    boolean existsByMatchIdAndUserId(UUID matchId, String userId);
}

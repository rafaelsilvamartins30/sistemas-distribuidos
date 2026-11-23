package br.unir.engagement.repository;

import br.unir.engagement.entity.SportsFreeAgent;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SportsFreeAgentRepository extends JpaRepository<SportsFreeAgent, UUID> {

    List<SportsFreeAgent> findByContextTypeAndContextIdAndStatusOrderByRegisteredAtAsc(String contextType,
            UUID contextId, String status);

    List<SportsFreeAgent> findByContextTypeAndContextIdAndStatusInOrderByRegisteredAtAsc(String contextType,
            UUID contextId, Collection<String> statuses);

    boolean existsByContextTypeAndContextIdAndUserIdAndStatus(String contextType, UUID contextId, String userId,
            String status);

    List<SportsFreeAgent> findByUserIdAndStatusOrderByRegisteredAtDesc(String userId, String status);
}

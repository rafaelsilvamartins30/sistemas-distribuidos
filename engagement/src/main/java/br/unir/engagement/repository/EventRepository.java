package br.unir.engagement.repository;

import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.RegistrationMode;
import java.time.Instant;
import java.util.Collection;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface EventRepository extends JpaRepository<Event, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select event from Event event where event.id = :eventId")
    java.util.Optional<Event> findByIdForUpdate(@Param("eventId") UUID eventId);

    @Query("""
            select event from Event event
            where event.status = :status
              and (event.registrationMode <> :externalPaid or event.registrationDeadline >= :now)
            """)
    Page<Event> findDiscoverableEvents(@Param("status") EventStatus status,
            @Param("externalPaid") RegistrationMode externalPaid, @Param("now") Instant now, Pageable pageable);

    Page<Event> findByOrganizerIdIn(Collection<UUID> organizerIds, Pageable pageable);
}

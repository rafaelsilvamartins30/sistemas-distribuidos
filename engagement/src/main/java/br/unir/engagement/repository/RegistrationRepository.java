package br.unir.engagement.repository;

import br.unir.engagement.entity.Registration;
import br.unir.engagement.entity.RegistrationStatus;
import java.time.Instant;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface RegistrationRepository extends JpaRepository<Registration, UUID> {

    @Query("select r.id from Registration r where r.userId = :userId")
    List<UUID> findPaymentReferences(@Param("userId") String userId);

    @Query("select r.id, e.id, e.title from Registration r, Event e where r.eventId = e.id and r.userId = :userId")
    List<Object[]> findPaymentReferenceDetails(@Param("userId") String userId);

    Optional<Registration> findFirstByEventIdAndUserIdAndStatusInOrderByRegisteredAtDesc(UUID eventId, String userId,
            List<RegistrationStatus> activeStatuses);

    @Query("""
            select count(registration) from Registration registration
            where registration.eventId = :eventId
              and (registration.status = :confirmed
                or (registration.status = :pendingPayment and registration.reservationExpiresAt > :now))
            """)
    long countCapacityOccupants(@Param("eventId") UUID eventId, @Param("confirmed") RegistrationStatus confirmed,
            @Param("pendingPayment") RegistrationStatus pendingPayment, @Param("now") Instant now);

    @Query("select count(registration) from Registration registration where registration.eventId = :eventId "
            + "and registration.status = :status")
    long countForEventAndStatus(@Param("eventId") UUID eventId, @Param("status") RegistrationStatus status);

    @Query("""
            select distinct registration.eventId from Registration registration
            where registration.status = :pendingPayment and registration.reservationExpiresAt <= :now
            """)
    List<UUID> findEventIdsWithExpiredPaymentReservations(@Param("pendingPayment") RegistrationStatus pendingPayment,
            @Param("now") Instant now, Pageable pageable);

    @Query("""
            select registration from Registration registration
            where registration.eventId = :eventId and registration.status = :pendingPayment
              and registration.reservationExpiresAt <= :now
            """)
    List<Registration> findExpiredPaymentReservationsForEvent(@Param("eventId") UUID eventId,
            @Param("pendingPayment") RegistrationStatus pendingPayment, @Param("now") Instant now);

    Page<Registration> findByUserIdOrderByRegisteredAtDesc(String userId, Pageable pageable);

    @Query("""
            select r from Registration r, Event e
            where r.eventId = e.id and r.userId = :userId
              and (cast(:eventId as uuid) is null or r.eventId = :eventId)
              and (cast(:startsFrom as timestamp) is null or e.startsAt >= :startsFrom)
              and (cast(:startsBefore as timestamp) is null or e.startsAt < :startsBefore)
              and (cast(:agenda as string) is null
                   or (:agenda = 'upcoming' and e.endsAt >= :now
                       and e.status <> br.unir.engagement.entity.EventStatus.CANCELLED
                       and r.status <> br.unir.engagement.entity.RegistrationStatus.CANCELLED_BY_USER
                       and r.status <> br.unir.engagement.entity.RegistrationStatus.CANCELLED_BY_EVENT)
                   or (:agenda = 'past' and e.endsAt < :now
                       and e.status <> br.unir.engagement.entity.EventStatus.CANCELLED
                       and r.status <> br.unir.engagement.entity.RegistrationStatus.CANCELLED_BY_USER
                       and r.status <> br.unir.engagement.entity.RegistrationStatus.CANCELLED_BY_EVENT)
                   or (:agenda = 'cancelled'
                       and (e.status = br.unir.engagement.entity.EventStatus.CANCELLED
                            or r.status = br.unir.engagement.entity.RegistrationStatus.CANCELLED_BY_USER
                            or r.status = br.unir.engagement.entity.RegistrationStatus.CANCELLED_BY_EVENT)))
            order by case when :agenda = 'upcoming' then e.startsAt end asc,
                     case when :agenda = 'past' then e.startsAt end desc,
                     case when :agenda = 'cancelled' then e.startsAt end desc,
                     r.registeredAt desc, r.id asc
            """)
    Page<Registration> findAgenda(@Param("userId") String userId, @Param("eventId") UUID eventId,
            @Param("startsFrom") Instant startsFrom, @Param("startsBefore") Instant startsBefore,
            @Param("agenda") String agenda, @Param("now") Instant now, Pageable pageable);

    @Query("select registration.eventId from Registration registration "
            + "where registration.id = :registrationId and registration.userId = :userId")
    Optional<UUID> findEventIdForUser(@Param("registrationId") UUID registrationId, @Param("userId") String userId);

    Optional<Registration> findByIdAndUserId(UUID registrationId, String userId);

    @Query("select registration.eventId from Registration registration where registration.id = :registrationId")
    Optional<UUID> findEventIdById(@Param("registrationId") UUID registrationId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select registration from Registration registration where registration.id = :registrationId")
    Optional<Registration> findByIdForUpdate(@Param("registrationId") UUID registrationId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select registration from Registration registration where registration.eventId = :eventId")
    List<Registration> findByEventIdForUpdate(@Param("eventId") UUID eventId);
}

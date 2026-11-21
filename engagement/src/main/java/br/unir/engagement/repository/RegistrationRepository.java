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

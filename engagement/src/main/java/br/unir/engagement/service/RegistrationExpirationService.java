package br.unir.engagement.service;

import br.unir.engagement.entity.Event;
import br.unir.engagement.entity.Registration;
import br.unir.engagement.entity.RegistrationStatus;
import br.unir.engagement.repository.EventRepository;
import br.unir.engagement.repository.RegistrationRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RegistrationExpirationService {

    private final EventRepository eventRepository;
    private final RegistrationRepository registrationRepository;

    public RegistrationExpirationService(EventRepository eventRepository,
            RegistrationRepository registrationRepository) {
        this.eventRepository = eventRepository;
        this.registrationRepository = registrationRepository;
    }

    @Scheduled(fixedDelayString = "${engagement.registration-expiry.poll-interval-ms:60000}")
    @Transactional
    public void expireDueReservations() {
        List<UUID> eventIds = new ArrayList<>(this.registrationRepository.findEventIdsWithExpiredPaymentReservations(
                RegistrationStatus.PENDING_PAYMENT, Instant.now(), PageRequest.of(0, 100)));
        eventIds.sort(Comparator.comparing(UUID::toString));

        for (UUID eventId : eventIds) {
            this.eventRepository.findByIdForUpdate(eventId).ifPresent(event -> expireForEvent(event, Instant.now()));
        }
    }

    private void expireForEvent(Event event, Instant now) {
        List<Registration> expired = this.registrationRepository.findExpiredPaymentReservationsForEvent(event.getId(),
                RegistrationStatus.PENDING_PAYMENT, now);
        expired.forEach(Registration::expirePayment);
        if (!expired.isEmpty()) {
            this.registrationRepository.saveAllAndFlush(expired);
        }
    }
}

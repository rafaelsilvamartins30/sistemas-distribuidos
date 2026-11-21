package br.unir.engagement.service;

import br.unir.engagement.dto.EventProjectionPayload;
import br.unir.engagement.entity.EventStatus;
import br.unir.engagement.entity.EventView;
import br.unir.engagement.entity.RegistrationMode;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import java.time.Instant;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

@Repository
public class EventProjectionStore {

    private final MongoTemplate mongoTemplate;

    @SuppressFBWarnings(value = "EI_EXPOSE_REP2", justification = "Spring injects the container-managed Mongo client")
    public EventProjectionStore(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    public void apply(EventProjectionPayload event) {
        String id = event.eventId().toString();
        Criteria newerVersionOnly = new Criteria().orOperator(
                Criteria.where("aggregateVersion").lt(event.aggregateVersion()),
                Criteria.where("aggregateVersion").exists(false));
        Query query = new Query(new Criteria().andOperator(Criteria.where("_id").is(id), newerVersionOnly));
        Update update = new Update().set("aggregateVersion", event.aggregateVersion()).set("title", event.title())
                .set("description", event.description()).set("organizerType", event.organizerType())
                .set("organizerId", event.organizerId().toString()).set("createdByUserId", event.createdByUserId())
                .set("imageUrl", event.imageUrl()).set("location", event.location()).set("startsAt", event.startsAt())
                .set("endsAt", event.endsAt()).set("category", event.category()).set("capacity", event.capacity())
                .set("registrationDeadline", event.registrationDeadline())
                .set("registrationMode", event.registrationMode()).set("price", event.price())
                .set("externalUrl", event.externalUrl()).set("attendanceEnabled", event.attendanceEnabled())
                .set("attendanceMode", event.attendanceMode()).set("status", event.status())
                .set("createdAt", event.createdAt());
        try {
            this.mongoTemplate.upsert(query, update, EventView.class);
        } catch (DuplicateKeyException exception) {
            EventView current = this.mongoTemplate.findById(id, EventView.class);
            if (current == null || current.aggregateVersion() < event.aggregateVersion()) {
                throw exception;
            }
            // A duplicate means another delivery already projected this version or a newer
            // one.
        }
    }

    public Page<EventView> findDiscoverable(Instant now, Pageable pageable) {
        Criteria discoverable = new Criteria().andOperator(Criteria.where("status").is(EventStatus.ACTIVE),
                new Criteria().orOperator(Criteria.where("registrationMode").ne(RegistrationMode.EXTERNAL_PAID),
                        Criteria.where("registrationDeadline").gte(now)));
        Query pageQuery = new Query(discoverable).with(pageable);
        Query countQuery = new Query(discoverable);
        return new PageImpl<>(this.mongoTemplate.find(pageQuery, EventView.class), pageable,
                this.mongoTemplate.count(countQuery, EventView.class));
    }

    public Optional<EventView> findById(String id) {
        return Optional.ofNullable(this.mongoTemplate.findById(id, EventView.class));
    }
}

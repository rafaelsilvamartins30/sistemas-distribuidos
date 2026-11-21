# Event read projection v1

Engagement remains the owner of event writes in PostgreSQL. Each successful
create, edit, or cancellation stores a full event snapshot in the same
transactional Outbox transaction as the PostgreSQL change. The existing
`EventCancelled` event used by the Registration/Payment/Access flow is left
unchanged; read projection cancellation uses its own event type.

## RabbitMQ envelope

All messages use the existing `IntegrationEventEnvelope` with
`schemaVersion: 1`, `aggregateType: "Event"`, the event UUID as
`aggregateId`, and the outbox UUID as `messageId`.

| Event type | Routing key |
| --- | --- |
| `EventProjectionCreated` | `engagement.event.projection.created.v1` |
| `EventProjectionUpdated` | `engagement.event.projection.updated.v1` |
| `EventProjectionCancelled` | `engagement.event.projection.cancelled.v1` |

`payloadJson` is a complete snapshot containing `eventId`, `aggregateVersion`,
and the same event data returned by `EventResponse`. `aggregateVersion` starts
at zero and increments through PostgreSQL's `@Version` field. The v1 event
names and routing keys make this projection contract independent of the
existing Saga event contracts.

Engagement publishes persistently with publisher confirms and retries an
unconfirmed or unroutable Outbox row. Its durable projection queue uses manual
ACK. A valid message is ACKed after MongoDB completes the version-guarded
upsert. Transient projection failures are requeued; unsupported envelopes or
invalid payloads are rejected to `engagement.event-projections.dlq`.
Redeliveries and out-of-order messages are safe: MongoDB only accepts a
snapshot if its aggregate version is newer than the stored version.

## Read and write paths

- `GET /api/v1/events` and `GET /api/v1/events/{eventId}` read MongoDB.
- List filtering remains the same: only `ACTIVE` events are discoverable, and
  expired `EXTERNAL_PAID` events are hidden. Details retain cancelled history.
- A MongoDB outage returns `503`; it does not silently fall back to
  PostgreSQL.
- Create, edit, cancel, managed-event queries, authorization, registrations,
  and transactional validation continue to use PostgreSQL.
- The Gateway and Web BFF keep their existing event HTTP routes and response
  shape. They route public reads into the Engagement read model without changes
  to their external contracts.

## Rebuild

After starting the local Compose stack, run:

```sh
docker compose exec -T engagement java -jar /app/app.jar \
  --server.port=0 \
  --spring.rabbitmq.listener.simple.auto-startup=false \
  --engagement.outbox.enabled=false \
  --engagement.event-projection.consumer-enabled=false \
  --engagement.event-projection.rebuild-and-exit=true
```

The one-shot runner scans all PostgreSQL Events, including cancelled records,
and applies the same version-guarded upsert. It does not delete MongoDB rows or
rewrite PostgreSQL. If an update races with the scan, an older snapshot cannot
replace a newer projection; the normal Outbox consumer applies the committed
change. Re-running the procedure is safe.

## Kubernetes handoff

The Kubernetes deployment should provide Engagement with `MONGODB_URI` pointing
to its Mongo service/database and persistent storage for MongoDB. It also needs
the same durable `unir.events` topic exchange and the durable
`engagement.event-projections` queue with the three v1 routing-key bindings and
dead-letter route to `engagement.event-projections.dlq`. Keep Engagement's
PostgreSQL credentials as the write-model connection. Startup readiness should
include MongoDB reachability; public event reads return `503` until MongoDB is
available. No Kubernetes manifest is part of this change.

## Scope decision

The planned CQRS target was reduced to Event for this iteration because Event
already has PostgreSQL commands, editing, and cancellation. Sports, teams,
matches, and results remain outside this projection until those write flows are
implemented.

# Event cancellation integration v1

Engagement decides institutional cancellation under the Event row lock. Its
transaction sets the Event to terminal `CANCELLED`, moves active/pending/expired
registrations to `CANCELLED_BY_EVENT`, and writes the integration messages below
to its Outbox. Consumers use the existing `unir.events` durable topic exchange
with at-least-once delivery.

The current Campus API exposes manager and administrator IDs as entity data but
does not provide a contextual authorization operation for a specific Event
organizer. The cancellation operation therefore remains internal to Engagement;
no public HTTP route is exposed until that check can use Campus authorization.

## `EventCancelled` v1

- Publisher: Engagement Outbox.
- Consumer: Access.
- Routing key: `engagement.event.cancelled.v1`.
- Envelope: common integration envelope with `aggregateType=Event`,
  `aggregateId=eventId`, and `schemaVersion=1`.
- Payload: `eventId`, `cancelledAt`.

Access persists event cancellation before acknowledging. It cancels the session
and eligible attendance entries without deleting them. Its event state prevents
a delayed `RegistrationConfirmed` from creating an active session.

## `RegistrationCancelledByEvent` v1

- Publisher: Engagement Outbox, once for each active, pending-payment, or
  payment-expired registration affected by cancellation.
- Consumer: Payment.
- Routing key: `engagement.registration.cancelled-by-event.v1`.
- Envelope: common integration envelope with `aggregateType=Registration`,
  `aggregateId=registrationId`, and `schemaVersion=1`.
- Payload: `registrationId`, `eventId`, `userId` (Keycloak subject),
  `cancelledAt`.

Payment persists this cancellation intent even if the charge has not arrived
yet. It marks a pending charge cancelled. For a captured charge it reuses the
existing full-refund path with the cancellation message ID as the refund request
identity. A later simulated capture of a cancelled/expired charge is recorded
and immediately sent through that same refund path.

Refund outcomes continue to use `RefundSucceeded` and `RefundFailed` v1. The
Engagement cancellation refund record is keyed by registration and the
`RegistrationCancelledByEvent` message ID so a transiently early result can be
retried until the local cancellation transaction is visible. Refund status is
only completed after Payment confirms success.

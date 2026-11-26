# Refund flow v1

This contract covers the compensating refund for a captured payment whose
registration can no longer be confirmed. Refunds are full only. Payment reads
the amount and currency from its persisted charge; Engagement never supplies or
recalculates a refund amount.

The approved domain events are `RefundRequested`, `RefundSucceeded`, and
`RefundFailed`. The routing keys below give those events their v1 transport
contract on the existing durable `unir.events` topic exchange.

## `RefundRequested` v1

- Publisher: Engagement transactional Outbox.
- Consumer queue: `payment.refund-requests`.
- Routing key: `engagement.payment.refund-requested.v1`.
- Envelope: common integration envelope, `aggregateType=Charge`,
  `aggregateId=chargeId`, `schemaVersion=1`.
- Delivery: at-least-once. `messageId` is the refund request identity; `chargeId`
  is the business idempotency key.

```json
{
  "messageId": "744019a0-f221-4fb5-8e41-ccba14af00d1",
  "eventType": "RefundRequested",
  "aggregateType": "Charge",
  "aggregateId": "937994f7-3bf7-55b3-8b2d-fd6b247787f4",
  "occurredAt": "2026-11-16T15:15:01Z",
  "schemaVersion": 1,
  "payloadJson": {
    "chargeId": "937994f7-3bf7-55b3-8b2d-fd6b247787f4",
    "registrationId": "8e871c70-cf63-45eb-a80a-a71a7098f1ed",
    "paymentMessageId": "2b4869bb-6466-4f3e-97bf-a060bde93ea0",
    "reason": "RESERVATION_EXPIRED"
  }
}
```

`paymentMessageId` identifies the persisted `PaymentConfirmed` publication that
caused the compensation case. `reason` is copied from Engagement's existing
compensation record. Payment verifies the charge and source confirmation before
acting. The refund provider idempotency key is stable: `unir-full-refund:<chargeId>`.

## `RefundSucceeded` v1

- Publisher: Payment transactional Outbox.
- Consumer queue: `engagement.refund-results`.
- Routing key: `payment.refund.succeeded.v1`.

The payload contains `chargeId`, `registrationId`, `requestMessageId`,
`amountMinor`, `currency`, and `refundedAt`. Amount and currency come from the
persisted Payment charge. `refundedAt` is the provider's effective success time.
Engagement marks the matching compensation case `COMPLETED` only after consuming
this result.

## `RefundFailed` v1

- Publisher: Payment transactional Outbox.
- Consumer queue: `engagement.refund-results`.
- Routing key: `payment.refund.failed.v1`.

The payload contains `chargeId`, `registrationId`, `requestMessageId`,
`failureCode`, and `failedAt`. Payment records the provider error in its Event
Store/projection; the result uses a stable code and does not claim a refund.
Engagement marks the matching compensation case `FAILED`. A redelivered request
retries the same full refund using the same provider idempotency key. A later
success can move the case from `FAILED` to `COMPLETED`; a late failure cannot
move a completed case backwards.

All three events are deduplicated by envelope `messageId` and by `chargeId`.
Payment records refund intent, provider result, projection changes, and its
result Outbox transactionally. Engagement records the compensation case and its
request Outbox atomically, then updates the case from result events. Registrations
remain in their terminal state throughout compensation.

## Notificação de estorno na central (`PAYMENT_REFUNDED`)

Ao consultar `GET /api/v1/web/notifications`, o Web BFF verifica de forma *best-effort*
as cobranças com status `REFUNDED` no Payment (`GET /api/v1/payments/me`), enriquece o
título da atividade no Engagement (`GET /api/v1/payment-references/me`) e sincroniza de
forma idempotente por `chargeId` no endpoint interno do Campus
`POST /internal/v1/refund-notifications` (não exposto no Gateway e autenticado pelo JWT
do próprio usuário). A notificação gerada (`eventType = PAYMENT_REFUNDED`,
`resourceType = PAYMENT`, `resourceId = chargeId`) soma no contador de não lidas e abre
diretamente `/pagamentos`.

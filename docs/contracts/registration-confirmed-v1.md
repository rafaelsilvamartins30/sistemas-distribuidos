# RegistrationConfirmed v1

Engagement emits this integration event after a registration becomes `CONFIRMED` when its Event has `attendanceEnabled = true`. The event is published through the existing `unir.events` topic exchange with routing key `engagement.registration.confirmed.v1`.

## Envelope

The shared envelope contains `messageId`, `eventType`, `aggregateType`, `aggregateId`, `occurredAt`, `schemaVersion`, and `payloadJson`.

- `messageId`: UUID generated once for the Outbox row and reused on every publication retry.
- `eventType`: `RegistrationConfirmed`.
- `aggregateType`: `Registration`.
- `aggregateId`: the registration UUID.
- `occurredAt`: when the registration became confirmed (for a paid registration, the effective `paidAt`; for a free registration, its confirmation time).
- `schemaVersion`: `1`.

## Payload

```json
{
  "registrationId": "0190b07a-69a5-7ab3-a428-63f997b4c5de",
  "eventId": "0190b07a-69a5-7ab3-a428-63f997b4c5df",
  "userId": "keycloak-subject",
  "attendanceEnabled": true,
  "attendanceMode": "PARTICIPANT_SCANS_EVENT",
  "eventTitle": "Encontro de Boas-vindas",
  "startsAt": "2027-06-15T17:00:00Z",
  "endsAt": "2027-06-15T19:00:00Z",
  "eventCreatorUserId": "keycloak-subject"
}
```

`registrationId`, `eventId`, and `userId` identify the confirmed participant. `userId` is the Keycloak JWT `sub`, not the Campus `UserProfile.id`. `attendanceEnabled` and `attendanceMode` carry the approved attendance configuration. `eventTitle`, `startsAt`, and `endsAt` provide the fields needed to create Access' `AttendanceSession` without a synchronous call to Engagement. No profile, payment, pricing, QR, or check-in-window data is included.

`eventCreatorUserId` is the Keycloak `sub` of the user who created the event, when known; it may be omitted or null for older events. Access compares this value with the request's authenticated `sub` before allowing organizer QR operations. The institutional `organizerId` is a separate identifier and is never treated as proof of who created the event. Existing events may have no creator recorded, in which case Access denies organizer operations. The current Engagement API is read-only for events; a future event creation flow must persist the authenticated creator for these organizer actions to become available.

Engagement only writes this event for attendance-enabled events. Access treats a valid payload with `attendanceEnabled = false` as a no-op and creates no attendance or idempotency rows. Check-in window values remain unset until their policy is approved.

Access deduplicates publication retries by envelope `messageId` and protects domain creation by `registrationId`. A second message ID for the same registration and identical payload is also an idempotent no-op.

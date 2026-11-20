# RegistrationCancelled v1

Engagement emits this event when a participant cancels their own confirmed registration. It uses the existing `unir.events` exchange and routing key `engagement.registration.cancelled.v1`.

The envelope follows the shared integration event format. `aggregateType` is `Registration`, `aggregateId` is the registration UUID, and `schemaVersion` is `1`.

```json
{
  "registrationId": "0190b07a-69a5-7ab3-a428-63f997b4c5de",
  "eventId": "0190b07a-69a5-7ab3-a428-63f997b4c5df",
  "userId": "keycloak-subject",
  "cancelledAt": "2027-06-01T12:00:00Z"
}
```

Access uses the registration, event, and participant identities together. A matching eligible ticket becomes `CANCELLED` and its personal QR token is revoked. Repeated deliveries are idempotent. A check-in already recorded remains in the attendance history.

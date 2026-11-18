# Web BFF

Fastify service for web-specific HTTP endpoints. The BFF has no database; it
forwards the caller's bearer token and JSON payloads to Campus, which validates
them and persists profiles.

## Endpoints

- `GET /health` returns `200` while the process is running.
- `GET /api/v1/me` forwards the bearer token to `GET /users/me` on Campus and
  preserves its status and response body.
- `POST /api/v1/users` forwards the bearer token and JSON payload to
  `POST /users` on Campus and preserves its status (`201`, `400`,
  `409`) and response body.
- `PATCH /api/v1/me` forwards the bearer token and JSON payload to
  `PATCH /users/me` on Campus and preserves its status (`200`, `400`,
  `404`) and response body.
- `GET /api/v1/web/events` and `GET /api/v1/web/events/{eventId}` forward the
  bearer token and list query to the Engagement Service (`/api/v1/events` and
  `/api/v1/events/{eventId}`), preserving its status, content type, and body.
  Connection failures return `503`.
- `GET /api/v1/web/opportunities` and
  `GET /api/v1/web/opportunities/{opportunityId}` forward the bearer token and
  list filters to Engagement, preserving its status, content type, and body.
- `GET /api/v1/web/opportunities/publisher-contexts` and
  `POST /api/v1/web/opportunities` forward the original user token to
  Engagement. Engagement rechecks each selected publisher context against
  Campus; the BFF does not make authorization decisions.
- `POST /api/v1/web/professor-verification-requests`, the department-scoped
  pending-list route, and the approve/reject routes forward requests to Campus,
  which derives both requester and reviewer identity from the token.
  Opportunities still use only external application links; no internal
  application is created.
- `POST /api/v1/web/events/{eventId}/registrations`,
  `GET /api/v1/web/me/activities`, and
  `DELETE /api/v1/web/registrations/{registrationId}` forward free-event
  registration operations to Engagement. DELETE performs a logical
  cancellation and preserves the registration history.
- `GET /api/v1/web/university`, `GET /api/v1/web/departments`, and
  `GET /api/v1/web/departments/{departmentId}` forward the bearer token and
  list query to Campus. Department responses omit `administratorUserIds` from
  the Web contract; Campus retains those references in its model.
- `GET /api/v1/web/entities`, `GET /api/v1/web/entities/{entityId}`,
  `GET /api/v1/web/communities`, and
  `GET /api/v1/web/communities/{communityId}` forward the bearer token and
  pagination query to Campus. Responses omit `managerUserIds`, which remain
  internal references to Keycloak users.

## Local development

Requires Node.js 22 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

`CAMPUS_URL` defaults to `http://localhost:3000`; `ENGAGEMENT_SERVICE_URL`
defaults to `http://localhost:8080`. `PORT` defaults to `3000`. Compose sets
the service URLs to `http://campus:3000` and `http://engagement:8080`.

# Web BFF

Fastify service for web-specific HTTP endpoints. The BFF has no database; it
forwards the caller's bearer token and JSON payloads to the User Service, which
validates them.

## Endpoints

- `GET /health` returns `200` while the process is running.
- `GET /api/v1/me` forwards the bearer token to `GET /users/me` on the User
  Service and preserves its status and response body.
- `POST /api/v1/users` forwards the bearer token and JSON payload to
  `POST /users` on the User Service and preserves its status (`201`, `400`,
  `409`) and response body.
- `PATCH /api/v1/me` forwards the bearer token and JSON payload to
  `PATCH /users/me` on the User Service and preserves its status (`200`, `400`,
  `404`) and response body.

## Local development

Requires Node.js 22 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

`USER_SERVICE_URL` defaults to `http://localhost:8080`. `PORT` defaults to
`3000`. The Compose service sets the User Service URL to
`http://user-service:8080`.

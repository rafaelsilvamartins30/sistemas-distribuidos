# Web BFF

Fastify service for web-specific HTTP endpoints. The BFF has no database; it
forwards the caller's bearer token to the User Service, which validates it.

## Endpoints

- `GET /health` returns `200` while the process is running.
- `GET /api/v1/me` forwards the bearer token to `GET /users/me` on the User
  Service and preserves its status and response body.

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

# Gateway

Ponto de entrada HTTP da plataforma UNIR, implementado com Spring Cloud Gateway (Java 21, Spring Boot e Maven). Valida os JWTs emitidos pelo Keycloak e encaminha as requisições autorizadas para os BFFs.

## Fluxo e endpoints

- `GET /api/v1/me` exige JWT válido do Keycloak com role global `USER` ou `PLATFORM_ADMIN` e encaminha a requisição (preservando o header `Authorization`) para `GET /api/v1/me` no Web BFF (`Cliente HTTP → Gateway → Web BFF → User Service`).
- Demais rotas e métodos são negados por padrão (`denyAll`).

## Ambiente local

No `compose.yaml` da raiz, o serviço `gateway` expõe a porta `18084` (configurável por `GATEWAY_PORT` em `.env`) e encaminha para `http://web-bff:3000`.

Variáveis de ambiente principais:
- `WEB_BFF_URL` (padrão local: `http://localhost:18083`, no Compose: `http://web-bff:3000`)
- `KEYCLOAK_ISSUER_URI` (padrão: `http://localhost:18081/realms/unir`)
- `KEYCLOAK_JWK_SET_URI` (padrão local: `http://localhost:18081/realms/unir/protocol/openid-connect/certs`, no Compose: `http://keycloak:8080/realms/unir/protocol/openid-connect/certs`)
- `WEB_ORIGIN` (padrão: `http://localhost:15173`)

## Qualidade

Na pasta `gateway`: `make quality` (`mvn --batch-mode verify`) ou `make test` (`mvn --batch-mode test`), ou pela raiz com `make gateway` e `make test COMPONENT=gateway`.

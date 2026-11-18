# Gateway

Ponto de entrada HTTP da plataforma UNIR, implementado com Spring Cloud Gateway (Java 21, Spring Boot e Maven). Valida os JWTs emitidos pelo Keycloak e encaminha as requisições autorizadas para os BFFs.

## Fluxo e endpoints

O fluxo das aplicações Web e Administration passa pelo Gateway:

- `Web → Gateway → Web BFF → Campus`
- `Admin Web → Gateway → Admin BFF → Campus`

Endpoints expostos (exigem JWT válido do Keycloak e preservam o header `Authorization` e os corpos de requisição/resposta):
- `GET /api/v1/me` (`USER` ou `PLATFORM_ADMIN`) → encaminha para `GET /api/v1/me` no Web BFF e `GET /users/me` no Campus.
- `POST /api/v1/users` (`USER` ou `PLATFORM_ADMIN`) → encaminha para `POST /api/v1/users` no Web BFF e `POST /users` no Campus.
- `PATCH /api/v1/me` (`USER` ou `PLATFORM_ADMIN`) → encaminha para `PATCH /api/v1/me` no Web BFF e `PATCH /users/me` no Campus.
- `GET /api/v1/admin/me` (somente `PLATFORM_ADMIN`, retorna `403` para usuários comuns) → encaminha para `GET /api/v1/admin/me` no Admin BFF e `GET /users/me` no Campus.
- `GET /api/v1/web/events` e `GET /api/v1/web/events/{eventId}` (`USER` ou `PLATFORM_ADMIN`) → encaminham para as mesmas rotas no Web BFF e daí para `GET /api/v1/events` e `GET /api/v1/events/{eventId}` no Engagement.
- `GET /api/v1/web/opportunities` e `GET /api/v1/web/opportunities/{opportunityId}` (`USER` ou `PLATFORM_ADMIN`) → encaminham para o Web BFF e daí para os detalhes/lista de oportunidades do Engagement.
- `GET /api/v1/web/opportunities/publisher-contexts` e `POST /api/v1/web/opportunities` (`USER` ou `PLATFORM_ADMIN`) → encaminham para Engagement, que consulta o Campus com o token original e revalida o contexto institucional antes de gravar.
- As rotas de pedido, consulta e revisão da verificação docente (`/api/v1/web/professor-verification-requests...`) encaminham para Campus; a permissão de revisão é decidida pelo vínculo de administrador do departamento registrado no Campus.
- `POST /api/v1/web/events/{eventId}/registrations`, `GET /api/v1/web/me/activities` e `DELETE /api/v1/web/registrations/{registrationId}` (`USER` ou `PLATFORM_ADMIN`) → encaminham as operações de inscrição ao Engagement. DELETE cancela logicamente e mantém o histórico.
- `GET /api/v1/web/university`, `GET /api/v1/web/departments` e `GET /api/v1/web/departments/{departmentId}` (`USER` ou `PLATFORM_ADMIN`) → encaminham para o Web BFF e daí para `/university` e `/departments` no Campus.
- `GET /api/v1/web/entities`, `GET /api/v1/web/entities/{entityId}`, `GET /api/v1/web/communities` e `GET /api/v1/web/communities/{communityId}` (`USER` ou `PLATFORM_ADMIN`) → encaminham para o Web BFF e daí para `/entities` e `/communities` no Campus. As listas preservam os parâmetros de paginação; IDs de gestores são removidos pelo Web BFF.
- Demais rotas e métodos são negados por padrão (`denyAll`).
- CORS habilitado para `WEB_ORIGIN` nas rotas de perfil (`GET`, `POST`, `PATCH`, `OPTIONS`), eventos e inscrições (`GET`, `POST`, `DELETE`, `OPTIONS`), e para `ADMIN_WEB_ORIGIN` na rota administrativa (`GET`, `OPTIONS`).

## Ambiente local

No `compose.yaml` da raiz, o serviço `gateway` expõe a porta `18084` (configurável por `GATEWAY_PORT` em `.env`) e encaminha para `http://web-bff:3000` e `http://admin-bff:3000`. As aplicações `web` e `admin-web` consomem o Gateway por meio de `VITE_GATEWAY_URL`.

Variáveis de ambiente principais:
- `WEB_BFF_URL` (padrão local: `http://localhost:18083`, no Compose: `http://web-bff:3000`)
- `ADMIN_BFF_URL` (no Compose: `http://admin-bff:3000`, comunicação apenas na rede interna pois o Admin BFF não publica porta no host; para executar o Gateway fora do Compose, inicie o `admin-bff` localmente em uma porta dedicada e aponte `ADMIN_BFF_URL` para esse endereço)
- `KEYCLOAK_ISSUER_URI` (padrão: `http://localhost:18081/realms/unir`)
- `KEYCLOAK_JWK_SET_URI` (padrão local: `http://localhost:18081/realms/unir/protocol/openid-connect/certs`, no Compose: `http://keycloak:8080/realms/unir/protocol/openid-connect/certs`)
- `WEB_ORIGIN` (padrão: `http://localhost:15173`)
- `ADMIN_WEB_ORIGIN` (padrão: `http://localhost:15175`)

## Qualidade

Na pasta `gateway`: `make quality` (`mvn --batch-mode verify`) ou `make test` (`mvn --batch-mode test`), ou pela raiz com `make gateway` e `make test COMPONENT=gateway`.

# Web BFF (`web-bff`)

Backend for Frontend dedicado ao cliente principal **UNIR Web (`web`)**. Atua como camada de adaptação HTTP sem banco de dados próprio.

- **Stack:** Node.js 22 + Fastify + TypeScript (`pnpm`).
- **Acesso:** interno no Kubernetes (`ClusterIP` `web-bff:3000`), chamado exclusivamente pelo `gateway`.

---

## Como funciona e singularidades

1. **Sem estado e sem banco de dados:** o `web-bff` nunca acessa bancos diretamente (regra aplicada automaticamente em `scripts/check-ts-architecture.mjs`). Ele pode ser escalado horizontalmente de forma trivial (`kubectl scale deployment/web-bff --replicas=3`, validado em `make k8s-scale-demo`).
2. **Propagação de identidade e zero decisão de autorização:** sempre repassa o header `Authorization: Bearer <jwt>` intacto para `Campus`, `Engagement`, `Payment`, `Access` e `AI / RAG`, preservando status codes e payloads de erro de domínio (falhas de conexão retornam `503`).
3. **Timeouts dedicados por natureza da operação:** consultas padrão de domínio usam timeout curto, enquanto `POST /api/v1/web/rag/query` aplica deadline dedicado de `30s` para acomodar busca vetorial + geração no Gemini.
4. **Sanitização de respostas públicas:** remove campos internos de controle administrativo onde apropriado antes de responder ao cliente Web.
5. **Limite de responsabilidades:** não expõe mutações da universidade, do catálogo de semestres ou da gestão esportiva. Essas operações passam pelo Admin BFF; o Web mantém leitura, participação esportiva e edição contextual das outras entidades.

---

## Rotas expostas (via Gateway)

- `GET /health`
- **Campus:** `/api/v1/me`, `/api/v1/users`, `/api/v1/web/users`, `/api/v1/web/university`, `/academic-units`, `/departments`, `/courses`, `/entities`, `/communities`, `/requests`, `/professor-verification-requests`, `/profiles/:type/:id/posts`, `/follows`, `/feed`, `/polls/:id/votes`, `/notifications`
- **Engagement:** `/api/v1/web/events/**`, `/registrations/**`, `/me/activities`, `/opportunities/**`, `/sports/**`, `/competitions/**`, `/seasons/**`, `/sports-events/**`, `/sports-matches/**`
- **Payment:** `/api/v1/web/payments/me`, `/api/v1/web/payments/:registrationId/confirm`
- **Access:** `/api/v1/web/attendance/**`
- **AI / RAG:** `POST /api/v1/web/rag/query`
- **Contratos:** [OpenAPI](../docs/api/openapi.yaml) e [docs/contracts/](../docs/contracts/)

---

## Qualidade

```sh
make web-bff
```

`GET /api/v1/web/payments/me` enriches each existing Payment charge via `GET /api/v1/payment-references/me` in Engagement with `origin` (`EVENT`, `SPORTS_TEAM`, `SPORTS_FREE_AGENT`, or `UNKNOWN`), readable `title`, `subtitle`, and `targetPath` for direct navigation. If Engagement is unavailable, the charges remain visible with unknown origin.

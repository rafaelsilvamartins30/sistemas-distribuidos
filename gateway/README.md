# API Gateway (`gateway`)

Ponto único de entrada HTTP (`/api/v1/**`) da plataforma UNIR, responsável por **autenticação JWT**, **autorização de borda por papel**, **CORS** e **roteamento** para os BFFs.

- **Stack:** Java 21 + Spring Boot + Spring Cloud Gateway Server WebMVC + Spring Security OAuth2 Resource Server.
- **Acesso:** recebido pelo `Ingress/unir-ingress` em `/api` → `ClusterIP` `gateway:8080`.

---

## Como funciona e singularidades

1. **Validação JWT RS256 e `denyAll` por padrão:**
   - Valida assinatura (via JWKS do Keycloak), emissor (`KEYCLOAK_ISSUER_URI`), validade e papéis do realm (`USER`, `PLATFORM_ADMIN`).
   - Qualquer rota ou método HTTP que não esteja explicitamente liberado em `SecurityConfiguration` é negado por padrão.
   - Preserva o header `Authorization` original ao encaminhar para os BFFs para que cada serviço de domínio revalide o token e aplique autorização contextual.
2. **Separação estrita de superfícies (`Web` vs. `Admin`):**
   - `/api/v1/me`, `/api/v1/users`, `/api/v1/web/**` → exige `USER` ou `PLATFORM_ADMIN` → encaminha para `web-bff:3000`.
   - `/api/v1/admin/**` → exige exclusivamente `PLATFORM_ADMIN` (`403` para usuários comuns) → encaminha para `admin-bff:3000`.
3. **Exposição controlada do RAG:** publica somente `POST /api/v1/web/rag/query`; rotas de ingestão (`/api/v1/rag/ingest`) e avaliação permanecem inacessíveis externamente.

---

## Principais grupos de rotas e contratos

- **Perfil e diretório:** `/api/v1/me`, `/api/v1/users`, `GET /api/v1/web/users`
- **Estrutura, social e notificações (Campus):** `/api/v1/web/university`, `/academic-units`, `/departments`, `/courses`, `/entities`, `/communities`, `/requests`, `/professor-verification-requests`, `/profiles/{type}/{id}/posts`, `/follows`, `/feed`, `/polls/{id}/votes`, `/notifications`
- **Eventos, oportunidades e esportes (Engagement):** `/api/v1/web/events/**`, `/api/v1/web/registrations/**`, `/api/v1/web/me/activities`, `/api/v1/web/opportunities/**`, `/api/v1/web/sports/**`, `/api/v1/web/competitions/**`, `/api/v1/web/seasons/**`, `/api/v1/web/sports-events/**`, `/api/v1/web/sports-matches/**`
- **Pagamentos e Presença:** `/api/v1/web/payments/**`, `/api/v1/web/attendance/**`
- **Assistente IA:** `POST /api/v1/web/rag/query`
- **Administração (`PLATFORM_ADMIN`):** `/api/v1/admin/**`
- **Contratos:** [OpenAPI](../docs/api/openapi.yaml) e [docs/contracts/](../docs/contracts/)

---

## Qualidade

```sh
make gateway
# ou dentro de gateway/:
make quality   # Spotless, Checkstyle, JUnit/MockMvc, ArchUnit, PMD e SpotBugs
```

# Campus (`campus`)

Serviço de domínio responsável pela **estrutura institucional**, **perfis de usuários**, **autorização contextual**, **comunidades**, **publicações/enquetes** e **notificações** da UNIR.

- **Stack:** Ruby 3.4 / Ruby on Rails 8 + PostgreSQL próprio (`campus-db` / `unir_campus`).
- **Acesso:** interno no Kubernetes (`ClusterIP` `campus:3000`); o tráfego do navegador chega exclusivamente via `Ingress → Gateway → Web BFF / Admin BFF`.

---

## Como funciona e singularidades

1. **Fonte de verdade de autorização contextual:** o Keycloak autentica a identidade (`sub`) e papéis globais (`USER`, `PLATFORM_ADMIN`), mas quem decide quem administra a Universidade, cada Unidade Acadêmica, Departamento, Entidade ou Comunidade — e quais docentes possuem afiliação `ACTIVE` — é o `Campus`. O `Engagement` consulta `/internal/v1/...` preservando o JWT do usuário antes de permitir criação/edição/cancelamento.
2. **Verificação docente real:** declarar `PROFESSOR` no perfil não concede permissão; a afiliação docente ativa (`ProfessorAffiliation` `ACTIVE`) só nasce após aprovação de uma `InstitutionalRequest` (`PROFESSOR_VERIFICATION`) por um administrador do departamento.
3. **Sem UUIDs manuais na interface:** `GET /users` expõe busca paginada de perfis (nome, matrícula, departamento e `keycloakUserId`) usada pelo seletor de administradores (`UserPicker`) no frontend.
4. **Modos de seed (`db/seeds.rb`):**
   - `UNIR_SEED_MODE=clean`: cria apenas a Universidade (`UFLA`), o semestre atual e vincula o admin (`admin@gmail.com`).
   - `UNIR_SEED_MODE=demo`: cria Universidade, 1 Unidade (`ICET`), 2 Departamentos (`DCC`, `DEG`), 2 Cursos, 3 Comunidades (1 da universidade + 1 por departamento), 2 Entidades (1 por departamento) e 51 perfis (1 admin, 10 professores verificados e 40 alunos).
5. **Migrations isoladas no Kubernetes:** executadas via `initContainer` (`db-migrate`) antes de iniciar o servidor Rails.

---

## Endpoints e contratos

- **Perfis e diretório:** `GET /users`, `POST /users`, `GET /users/me`, `PATCH /users/me`
- **Estrutura institucional:** `GET/PATCH /university`, `GET/POST/PATCH/DELETE /academic-units`, `/departments`, `/courses`, `/semesters`
- **Entidades, comunidades e solicitações:** `/entities`, `/communities`, `/requests`, `/professor-verification-requests`
- **Social e notificações:** `/profiles/:profileType/:profileId/posts`, `/follows`, `/feed`, `/polls/:pollId/votes`, `/communities/:id/space/posts`, `/community-space-posts/:id/comments`, `/notifications`
- **Contratos detalhados:**
  - [Catálogo Acadêmico](../docs/contracts/campus-academic-catalog.md)
  - [Semestres](../docs/contracts/campus-semesters.md)
  - [Social, Feed e Notificações](../docs/contracts/campus-social.md)
  - [OpenAPI](../docs/api/openapi.yaml)

---

## Qualidade

```sh
make campus
# ou dentro de campus/:
make quality   # RuboCop, Brakeman, Zeitwerk e Rails test (SQLite + JWKS simulado)
```

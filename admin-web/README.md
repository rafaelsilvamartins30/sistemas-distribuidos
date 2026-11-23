# Administration (`admin-web`)

Painel administrativo dedicado à governança institucional da UNIR, acessível em `http://admin.localhost:18080` via Traefik Ingress.

- **Stack:** React 18 + TypeScript + Vite + `keycloak-js` (`pnpm`).
- **Integração:** autentica via OIDC no Keycloak e consome exclusivamente `/api/v1/admin/**` no `gateway` (exige papel global `PLATFORM_ADMIN`, ex.: `admin@gmail.com` / `123`).

---

## Funcionalidades

- Edição dos dados da Universidade singleton (nome, sigla, descrição, Markdown e semestre atual);
- Criação, edição e remoção de **Unidades Acadêmicas**, **Departamentos**, **Cursos** e **Semestres**;
- Gestão de administradores contextuais (`administratorUserIds`) de unidades, departamentos, entidades e comunidades (habilitando gestão diretamente no cliente `web`);
- Revisão (aprovação/recusa) de solicitações pendentes.

---

## Qualidade

```sh
make admin-web   # ESLint, Prettier, tsc, node --test e vite build
```

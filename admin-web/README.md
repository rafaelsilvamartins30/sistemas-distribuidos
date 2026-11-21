# Administration (`admin-web`)

Cliente web administrativo da UNIR (React + TypeScript + Vite), acessível em `http://localhost:15175` (Compose) ou `http://admin.localhost:18080` (Kubernetes).

## Funcionalidades

- Autenticação OIDC via Keycloak exigindo papel global `PLATFORM_ADMIN` validado no API Gateway.
- Edição inline do perfil institucional da Universidade (nome, sigla, descrição e semestre atual).
- Criação de Unidades Acadêmicas, Departamentos, Cursos e Semestres.
- Gestão de listas de administradores (`administratorUserIds`) de entidades, departamentos, unidades e comunidades (habilitando os botões de gestão contextual no cliente Web).
- Exclusão de estruturas acadêmicas e aprovação/recusa de solicitações pendentes.

## Qualidade

```sh
pnpm run build && pnpm test
```

# Administration (`admin-web`)

Painel administrativo dedicado à governança institucional e esportiva da UNIR, acessível em `http://admin.localhost:18080` (Kubernetes) ou `http://localhost:15175` (Docker Compose).

- **Stack:** React 18 + TypeScript + Vite + `keycloak-js` (`pnpm`).
- **Integração:** autentica via OIDC no Keycloak e consome exclusivamente `/api/v1/admin/**` no `gateway` (exige papel global `PLATFORM_ADMIN`, ex.: `admin@gmail.com` / `123`).

---

## Funcionalidades

- **Notificações laterais globais (`ToastContext` + `apiError.ts`):** erros reais de validação e feedbacks aparecem na *top layer* (`popover="manual"`), sempre visíveis acima dos modais (`AdminModal`).
- **Governança institucional:** edição dos dados da Universidade singleton (nome, sigla, descrição, Markdown e semestre atual) e criação/edição/remoção de **Unidades Acadêmicas**, **Departamentos**, **Cursos** e **Semestres**.
- **Gestão esportiva (`SportsManagementPanel`):** cadastro de **Modalidades**, **Campeonatos (Copa 32)** e **Temporadas (Liga 10)**, edição de prazo, cancelamento com estorno automático, geração de tabela, lançamento de placares e pênaltis (`PENALTIES_REQUIRED`) e escolha manual de campeão em caso de empate total.
- **Presença e QR Code unificados (`MatchAttendanceModal`):** modal com duas abas por partida (**QR Code** para gerar/renovar/copiar + **Lista de presença** com acompanhamento em tempo real, cópia da lista e fechamento definitivo).
- **Permissões e solicitações:** gestão de administradores contextuais (`administratorUserIds`) de unidades, departamentos, entidades e comunidades, e aprovação/recusa de solicitações pendentes.

---

## Qualidade

```sh
make admin-web   # ESLint, Prettier, tsc, node --test e vite build
```

# Web (`web`)

Cliente web principal da plataforma UNIR, acessível em `http://localhost:18080` (Kubernetes) ou `http://localhost:15173` (Docker Compose).

- **Stack:** React 18 + TypeScript + Vite + `keycloak-js` (`pnpm`).
- **Integração:** autentica via OIDC no Keycloak (`/realms/unir`, client `unir-web`) e consome exclusivamente o `gateway` (`/api/v1/**`).

---

## Funcionalidades e padrões de interface

- **Notificações laterais globais (`ToastContext` + `apiError.ts`):** todos os 11 serviços HTTP extraem as mensagens reais de erro dos backends (`ProblemDetail.detail`, `message`, `errors`) e exibem notificações no canto superior direito usando *top layer* (`popover="manual"`), sempre visíveis acima de modais e `<dialog>`.
- **Modais padronizados (`Modal.tsx`):** estrutura reutilizável com fechamento por `Esc`/backdrop, cabeçalho uniforme e suporte a abas.
- **Publicações e Perfis (`/`, `/perfis`):** feed institucional filtrado por semestre, perfis de universidade, unidades, departamentos, entidades e comunidades, espaço de discussões de comunidade, enquetes, notificações e edição de perfis contextuais (`InstitutionalProfileEditor`).
- **Eventos (`/eventos`):** listagem paginada a partir do read model CQRS (MongoDB), criação/edição para contextos autorizados, inscrição gratuita ou paga com **checkout Pix integrado no próprio fluxo (`PaymentCheckoutModal`)**, cancelamento com estorno automático e **Modal Unificado de Presença (`UniversalAttendanceModal`)** com duas abas para organizadores (**QR Code / Leitor** + **Lista de presença** em tempo real com cópia e fechamento).
- **Oportunidades (`/oportunidades`):** bolsas, estágios, pesquisa e extensão com criação/edição por contextos autorizados (`PROFESSOR` verificado, `DEPARTMENT` ou `ACADEMIC_ENTITY`).
- **Esportes (`/esportes`, `/meus-esportes`):**
  - Catálogo de modalidades, Copa de **32 times** (8 grupos + Oitavas, Quartas, Semifinal e Final em Ida e Volta + Pênaltis) e Temporada de **10 times** (18 rodadas), classificação oficial e chaveamento;
  - Inscrição por **Criar Time com Código 24h**, **Entrar com Código** ou **Free Agent**, com checkout Pix integrado quando há taxa de inscrição;
  - Check-in em partidas pelo mesmo `UniversalAttendanceModal`.
- **Assistente UNIR (RAG):** widget flutuante presente em todas as telas conectado a `POST /api/v1/web/rag/query` com filtros (`Tudo`, `Eventos`, `Oportunidades`), fontes clicáveis, status (`Gerado · gemini-3.5-flash` vs. `Fallback`) e telemetria.
- **Menu da conta:** `/perfil`, `/tickets` (com QR de entrada e confirmação de presença), `/meus-esportes`, `/pagamentos` (central financeira com títulos reais das inscrições, links diretos e `PaymentCheckoutModal`) e `/solicitacoes`.

---

## Qualidade

```sh
make web   # ESLint, Prettier, tsc, node --test e vite build
```

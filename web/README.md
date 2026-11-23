# Web (`web`)

Cliente web principal da plataforma UNIR, acessível em `http://localhost:18080` via Traefik Ingress.

- **Stack:** React 18 + TypeScript + Vite + `keycloak-js` (`pnpm`).
- **Integração:** autentica via OIDC no Keycloak (`/realms/unir`, client `unir-web`) e consome exclusivamente o `gateway` (`/api/v1/**`).

---

## Funcionalidades e fluxos implementados

- **Publicações e Perfis (`/`, `/perfis`):** feed institucional filtrado por semestre, perfis de universidade, unidades, departamentos, entidades e comunidades, espaço de discussões de comunidade, enquetes, notificações e edição de perfis em **modal** com seletor de administradores por nome/matrícula (`UserPicker`, sem colar UUIDs).
- **Eventos (`/eventos`):** listagem paginada a partir do read model CQRS (MongoDB), criação/edição em modal para contextos autorizados, inscrição gratuita ou paga (PIX simulado), cancelamento com estorno automático e **Modal Universal de Presença** (QR Code / código manual).
- **Oportunidades (`/oportunidades`):** bolsas, estágios, pesquisa e extensão com criação/edição em modal por contextos autorizados (`PROFESSOR` verificado, `DEPARTMENT` ou `ACADEMIC_ENTITY`).
- **Esportes (`/esportes`):**
  - Visão separada para **Gestão da Universidade (`admin`)** vs. **Estudantes**;
  - Copa obrigatória de **32 times** (8 grupos + Oitavas, Quartas, Semifinal e Final em Ida e Volta + Pênaltis calculados sobre o **placar agregado real**) e Temporada de **10 times** (18 rodadas);
  - Inscrição por **Criar Time com Código 24h** (vagas excedentes ou expiradas liberadas automaticamente para Free Agents), **Entrar com Código** ou **Entrar como Free Agent**;
  - Modais administrativos para **Alterar data de inscrição** e **Cancelar campeonato** (com estorno PIX automático via Saga).
- **Assistente UNIR (RAG):** botão flutuante presente em todas as telas, abrindo chat conectado a `POST /api/v1/web/rag/query` com filtros (`Tudo`, `Eventos`, `Oportunidades`), consulta ao vivo, fontes clicáveis, status (`Gerado · gemini-3.5-flash` vs. `Fallback`) e telemetria (latência, tokens e custo).
- **Menu da conta:** `/perfil`, `/tickets` (com Modal Universal de Presença), `/meus-esportes`, `/pagamentos` (confirmação PIX simulada da Saga) e `/solicitacoes`.

---

## Qualidade

```sh
make web   # ESLint, Prettier, tsc, node --test e vite build
```

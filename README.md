# UNIR — Plataforma Universitária Distribuída

Plataforma universitária baseada em arquitetura de microsserviços orquestrada em **Kubernetes (`kind`)**, reunindo estrutura institucional, perfis e publicações acadêmicas, eventos, oportunidades, esportes universitários, pagamentos simulados (Saga), credenciamento/presença (QR Code) e busca assistida por IA (RAG com Qdrant + Gemini).

---

## Como rodar (Kubernetes local com `kind`)

### Pré-requisitos
- **Docker Desktop** (ou engine Docker compatível) em execução — usado apenas para construir as imagens OCI locais e hospedar o nó `kind`;
- `kubectl`, `make`, `python3` e `curl` no `PATH`;
- Conexão com a internet no primeiro boot (para baixar imagens base, dependências e o modelo local de embeddings do FastEmbed).
- O script de bootstrap instala `kind` automaticamente em `~/.local/bin` caso não esteja instalado. **Não** é necessário instalar Java, Ruby, Go, Rust ou Python tooling no host para rodar a aplicação.

### 1. Clonar e configurar variáveis de ambiente (opcional)
```sh
git clone --branch develop https://github.com/rafaelsilvamartins30/sistemas-distribuidos.git
cd sistemas-distribuidos
```

Se quiser personalizar senhas locais ou ativar a geração com LLM no Assistente RAG, crie `.env` (ignorado pelo Git) a partir do modelo:
```sh
cp config/local.env.example .env
```
Sem `.env`, o bootstrap usa automaticamente os valores locais padrão de [config/local.env.example](config/local.env.example).

### 2. Escolher o modo de inicialização

O projeto oferece **dois modos** limpos de inicialização no Kubernetes:

| Modo | Comando (subir / atualizar) | Comando (zerar e subir do zero) | O que vem no banco |
| --- | --- | --- | --- |
| **Demo enxuta** (padrão) | `make k8s-demo` | `make k8s-reset-demo` | Universidade configurada (`UFLA`), **1 admin** (`admin@gmail.com`), **10 professores verificados** (`professor1..10@gmail.com`), **40 alunos** (`aluno1..40@gmail.com`), **1 unidade acadêmica** (`ICET`), **2 departamentos** (`DCC` e `DEG`), **2 cursos**, **3 comunidades** (1 da universidade + 1 por departamento) e **2 entidades** (1 por departamento). **Zero** eventos, oportunidades, esportes ou posts pré-populados. |
| **Zerado (manual)** | `make k8s-clean` | `make k8s-reset-clean` | Apenas a Universidade configurada + **1 conta admin** (`admin@gmail.com` / `123`) para criar toda a estrutura manualmente. |

### Outros comandos úteis
| Comando | Descrição |
| --- | --- |
| `UNIR_K8S_REBUILD=true make k8s-demo` | Força reconstrução de todas as imagens locais antes de reaplicar os manifests no cluster. |
| `make k8s-down` | Remove o cluster `kind` local (`unir-local`) e seus dados. |
| `make k8s-verify` | Executa validação ponta a ponta no cluster (Ingress, OIDC, RAG, CQRS, inscrições e persistência). |
| `make k8s-scale-demo` | Demonstra escalabilidade horizontal (`1 → 3 → 1` réplicas no `web-bff`). |
| `make demo-saga` | Executa via CLI a Saga de pagamento simulado, projeção CQRS (MongoDB) e estorno por cancelamento. |
| `make ci` | Executa a pipeline completa de qualidade, infraestrutura e segurança (veja [docs/QUALITY.md](docs/QUALITY.md)). |

---

## Acessos e credenciais locais

| Interface / Recurso | Endereço |
| --- | --- |
| **UNIR Web** (estudantes, professores e gestão contextual) | <http://localhost:18080> |
| **UNIR Administration** (painel `PLATFORM_ADMIN`) | <http://admin.localhost:18080> |
| **API Gateway** | <http://localhost:18080/api/v1/...> |
| **Keycloak OIDC Discovery** | <http://localhost:18080/realms/unir/.well-known/openid-configuration> |
| **Painel RabbitMQ** (via port-forward) | `kubectl -n unir port-forward svc/rabbitmq 15673:15672` → <http://localhost:15673> |

**Contas iniciais (senha padrão `123`, salvas em `config/local-demo-accounts.json` ignorado pelo Git):**
- **Administrador:** `admin@gmail.com` (`USER` + `PLATFORM_ADMIN`)
- **Professores verificados (modo `demo`):** `professor1@gmail.com` até `professor10@gmail.com` (5 no `DCC`, 5 no `DEG`)
- **Alunos (modo `demo`):** `aluno1@gmail.com` até `aluno40@gmail.com` (20 no `DCC`, 20 no `DEG`)

---

## Variáveis de ambiente (`.env`)

Todas as variáveis lidas pelo bootstrap (`scripts/k8s-up.sh`) estão declaradas em [config/local.env.example](config/local.env.example):

| Variável | Padrão local | Obrigatória? | Finalidade |
| --- | --- | --- | --- |
| `UNIR_K8S_PORT` | `18080` | Não | Porta do host exposta pelo Ingress Traefik (definida na criação do cluster). |
| `UNIR_KIND_CLUSTER` | `unir-local` | Não | Nome do cluster `kind`. |
| `UNIR_SEED_MODE` | `demo` | Não | Modo de seed: `demo` ou `clean`. |
| `UNIR_DEMO_PASSWORD` | `123` | Não | Senha padrão das contas provisionadas localmente no Keycloak. |
| `DB_PASSWORD` | `unir-local-only` | Não | Senha dos bancos PostgreSQL internos (`campus`, `engagement`, `payment`, `access`). |
| `KEYCLOAK_DB_PASSWORD` | `keycloak-local-only` | Não | Senha do banco PostgreSQL do Keycloak. |
| `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD` | `admin` / `admin-local-only` | Não | Credenciais administrativas do Keycloak para provisionamento de contas e realm. |
| `RABBITMQ_USERNAME` / `RABBITMQ_PASSWORD` | `unir` / `unir-local-only` | Não | Credenciais do broker RabbitMQ (também usadas no painel de management). |
| `MONGODB_USERNAME` / `MONGODB_PASSWORD` | `unir` / `unir-local-only` | Não | Credenciais do MongoDB (read model CQRS do Engagement). |
| `RAG_SYNC_TOKEN` | `unir-rag-sync-local-only` | Não | Segredo interno (`X-RAG-Sync-Token`) para acionar a reindexação do Qdrant. |
| `RAG_SYNC_CLIENT_ID` / `RAG_SYNC_CLIENT_SECRET` | `unir-rag-sync` / `unir-rag-client-local-only` | Não | Client confidencial OIDC usado pelo `ai-rag` para ler eventos/oportunidades do Engagement. |
| `EMBEDDING_MODEL` | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | Não | Modelo ONNX local do FastEmbed (384 dimensões, multilíngue). |
| `GEMINI_API_KEY` | *(vazio)* | **Opcional** | Chave do Google AI Studio para geração com `gemini-3.5-flash` no Assistente RAG. Sem ela, o RAG opera em fallback explícito (`FALLBACK_RETRIEVAL_ONLY`), retornando apenas os documentos recuperados do Qdrant. |

---

## Documentação de arquitetura, infraestrutura e qualidade

- **[Arquitetura do Sistema (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)** — diagramas de comunicação HTTP, mensageria (Outbox/Saga/CQRS), Assistente RAG e limites entre serviços.
- **[Saga Coreografada (`docs/SAGA.md`)](docs/SAGA.md)** — fluxo completo de inscrições pagas, pagamento PIX simulado, emissão de tickets e compensações de estorno (`REFUNDED`) via Outbox + RabbitMQ.
- **[Infraestrutura Kubernetes (`docs/KUBERNETES.md`)](docs/KUBERNETES.md)** — topologia do cluster `kind`, manifests `00`–`10`, PVCs, Secrets, o que está implementado e o que está fora de escopo (TLS, HPA, NetworkPolicy, limits).
- **[Qualidade e Pipeline (`docs/QUALITY.md`)](docs/QUALITY.md)** — como rodar a pipeline de qualidade (`make ci`) e o que cada check valida em cada serviço.
- **[Contratos HTTP e de Mensageria (`docs/contracts/`)](docs/contracts/)** e **[Especificação OpenAPI (`docs/api/openapi.yaml`)](docs/api/openapi.yaml)**.
- **[Relatório Técnico GCC129 (`docs/relatorio-tecnico-gcc129.md`)](docs/relatorio-tecnico-gcc129.md)**.

---

## Sistemas da plataforma

| Sistema | Stack | Responsabilidade principal | Documentação |
| --- | --- | --- | --- |
| **Campus** | Ruby on Rails + PostgreSQL | Estrutura institucional (universidade, unidades, departamentos, cursos, semestres), perfis de usuários, verificação docente, entidades, comunidades, feed/enquetes, notificações e autorização contextual. | [campus/README.md](campus/README.md) |
| **Engagement** | Java 21 / Spring Boot + PostgreSQL + MongoDB + RabbitMQ | Eventos, oportunidades, inscrições, esportes universitários (Copa 32 / Liga 10, código 24h + Free Agents, mata-mata com agregado e pênaltis), Outbox transacional e **CQRS** em MongoDB. | [engagement/README.md](engagement/README.md) |
| **Payment** | Go + PostgreSQL + RabbitMQ | Event Store + projeção de cobranças + Outbox para inscrições pagas e estornos (`REFUNDED`) via **provedor PIX simulado** (`SimulatedPixProvider`, sem dinheiro real). | [payment/README.md](payment/README.md) |
| **Access** | Rust + PostgreSQL + RabbitMQ | Credenciamento de eventos, tickets, tokens QR com hash e registro/histórico de presença (`NO_SHOW`). | [access/README.md](access/README.md) |
| **AI / RAG** | Python / FastAPI / LangChain + Qdrant + FastEmbed + Gemini | Indexação vetorial idempotente de eventos/oportunidades, tool de consulta ao vivo e geração via `gemini-3.5-flash` com fallback degradado explícito. | [ai-rag/README.md](ai-rag/README.md) |
| **API Gateway** | Java 21 / Spring Cloud Gateway | Ponto único de entrada HTTP (`/api/v1/**`), validação JWT RS256 (Keycloak), controle de papéis (`USER` / `PLATFORM_ADMIN`) e CORS. | [gateway/README.md](gateway/README.md) |
| **Web BFF** | Node.js / Fastify / TypeScript | Backend for Frontend do cliente `web` (sem banco próprio), composição de chamadas e sanitização de campos internos. | [web-bff/README.md](web-bff/README.md) |
| **Admin BFF** | Node.js / Fastify / TypeScript | Backend for Frontend exclusivo do `admin-web` (`PLATFORM_ADMIN`), com agregação de visão geral administrativa. | [admin-bff/README.md](admin-bff/README.md) |
| **Web** | React / TypeScript / Vite | Aplicação principal para alunos, professores e gestores contextuais, incluindo o widget flutuante do Assistente UNIR (RAG). | [web/README.md](web/README.md) |
| **Administration** | React / TypeScript / Vite | Painel institucional (`PLATFORM_ADMIN`) para gerenciar universidade, unidades, departamentos, cursos, semestres, gestores e solicitações. | [admin-web/README.md](admin-web/README.md) |
| **Keycloak Theme** | Keycloakify / React | Identidade visual UNIR para login, cadastro, recuperação de conta e Account v3 do Keycloak. | [keycloak-theme/README.md](keycloak-theme/README.md) |

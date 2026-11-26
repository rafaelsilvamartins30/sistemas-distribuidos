# UNIR — Plataforma Universitária Distribuída

**Startup / Projeto:** UNIR (*University Network for Integration and Relationships*)  
**Autor:** Rafael Silva Martins — Matrícula `202420228` (GCC129 — Sistemas Distribuídos, UFLA · Regime Diferencial)

## Problema, Motivação e Impacto Social

Nas universidades públicas brasileiras, eventos acadêmicos, bolsas, projetos de extensão, comunidades estudantis e competições esportivas costumam ficar dispersos entre dezenas de canais desconectados (murais físicos, listas de e-mail, redes sociais genéricas e formulários isolados). Essa fragmentação dificulta a integração acadêmica e social — principalmente de estudantes ingressantes — e enfraquece o **senso de pertencimento universitário** (*sense of belonging*), fator comprovadamente associado à permanência estudantil na literatura científica (Strayhorn, 2018; Hausmann, Schofield & Woods, 2007; Tinto, 1993; Astin, 1984/1999; INEP/MEC).

A **UNIR** resolve esse problema reunindo, em uma plataforma distribuída poliglota executável localmente via **Docker Compose** ou **Kubernetes (`kind`)**, estrutura institucional, perfis e publicações acadêmicas, eventos, oportunidades, esportes universitários, pagamentos simulados (Saga), credenciamento/presença (QR Code + lista de presença) e busca assistida por IA (RAG com Qdrant + Gemini). A fundamentação científica completa e os indicadores de impacto estão detalhados em **[docs/relatorio-tecnico-gcc129.md](docs/relatorio-tecnico-gcc129.md)**.

---

## Como rodar localmente

A plataforma oferece **duas opções equivalentes** de execução local (ambas sobem os 21 serviços completos sem exigir Java, Ruby, Go, Rust ou Node.js no host):

1. **[Kubernetes local (`kind`)](docs/KUBERNETES.md)** — ambiente com Traefik Ingress unificado em `http://localhost:18080`, suporte a `make k8s-scale-demo` e `make k8s-verify`.
2. **[Docker Compose (sem Kubernetes)](docs/DOCKER.md)** — execução direta via `docker compose` (`compose.yaml`), exigindo apenas Docker + Compose.

### 1. Clonar e configurar variáveis de ambiente (opcional)
```sh
git clone https://github.com/rafaelsilvamartins30/sistemas-distribuidos.git
cd sistemas-distribuidos
```

Se quiser personalizar senhas/portas locais ou ativar a geração com LLM (`GEMINI_API_KEY`) no Assistente RAG, crie `.env` (ignorado pelo Git) a partir do modelo:
```sh
cp config/local.env.example .env
```
Sem `.env`, ambos os bootstraps (`scripts/k8s-up.sh` e `scripts/compose-up.sh`) usam automaticamente os valores locais padrão de [config/local.env.example](config/local.env.example).

### 2. Escolher o modo de inicialização (`demo` ou `clean`)

Tanto no **Kubernetes** quanto no **Docker Compose**, existem dois modos de inicialização:

- **Demo completa (`demo`):** Universidade (`UFLA`), **1 admin** (`admin@gmail.com`), **10 professores verificados** (`professor1..10@gmail.com`), **40 alunos** (`aluno1..40@gmail.com`), estrutura acadêmica (`ICET`, `DCC`, `DEG`, cursos, comunidades e entidades), **publicações e conversas no feed**, **2 eventos acadêmicos**, **2 oportunidades**, **2 ligas de tênis de mesa em duplas** (1 em andamento com 90 partidas e placares da rodada 1 + 1 pronta para gerar tabela) e **Qdrant/RAG já indexado**.
- **Limpo / usuário real (`clean`):** apenas a Universidade configurada + **1 conta admin** (`admin@gmail.com` / `123`) para cadastrar tudo manualmente.

#### Opção A — Kubernetes local (`kind`)
*Pré-requisitos: Docker em execução, `kubectl`, `make`, `python3` e `curl` (`kind` é instalado automaticamente em `~/.local/bin` se ausente).*

| Ação | Comando |
| --- | --- |
| Subir / atualizar **modo demo** | `make k8s-demo` |
| Zerar e subir **modo demo** do zero | `make k8s-reset-demo` |
| Subir / atualizar **modo limpo** | `make k8s-clean` |
| Zerar e subir **modo limpo** do zero | `make k8s-reset-clean` |
| Reconstruir imagens após editar código | `UNIR_K8S_REBUILD=true make k8s-demo` |
| Remover o cluster local | `make k8s-down` |
| Validação ponta a ponta no cluster | `make k8s-verify` |
| Demo de escalabilidade (`1 → 3 → 1` no `web-bff`) | `make k8s-scale-demo` |
| Demo ao vivo da Saga (pagamento + CQRS + estorno) | `make demo-saga` |

#### Opção B — Docker Compose (sem Kubernetes)
*Pré-requisitos: Docker Engine com plugin Compose v2 (`docker compose`), `make`, `python3` e `curl`.*

| Ação | Comando |
| --- | --- |
| Subir / atualizar **modo demo** | `make docker-demo` |
| Zerar volumes e subir **modo demo** do zero | `make docker-reset-demo` |
| Subir / atualizar **modo limpo** | `make docker-clean` |
| Zerar volumes e subir **modo limpo** do zero | `make docker-reset-clean` |
| Reconstruir imagens após editar código | `UNIR_DOCKER_REBUILD=true make docker-demo` |
| Parar containers (preservando volumes) | `make docker-down` |
| Parar containers e apagar volumes | `./scripts/compose-down.sh --volumes` |
| Demo ao vivo da Saga (pagamento + CQRS + estorno) | `make docker-demo-saga` |

> Veja todos os detalhes operacionais em **[docs/KUBERNETES.md](docs/KUBERNETES.md)** e **[docs/DOCKER.md](docs/DOCKER.md)**. Para rodar a pipeline completa de qualidade no host, use `make ci` ([docs/QUALITY.md](docs/QUALITY.md)).

---

## Acessos e credenciais locais

| Interface / Recurso | Kubernetes (`kind`) | Docker Compose |
| --- | --- | --- |
| **UNIR Web** (estudantes, professores e organizadores) | <http://localhost:18080> | <http://localhost:15173> |
| **UNIR Administration** (painel `PLATFORM_ADMIN`) | <http://admin.localhost:18080> | <http://localhost:15175> |
| **API Gateway** | <http://localhost:18080/api/v1/...> | <http://localhost:18084/api/v1/...> |
| **Keycloak OIDC Discovery** | <http://localhost:18080/realms/unir/.well-known/openid-configuration> | <http://localhost:18081/realms/unir/.well-known/openid-configuration> |
| **Painel RabbitMQ** | `kubectl -n unir port-forward svc/rabbitmq 15673:15672` → <http://localhost:15673> | <http://localhost:15672> |
| **Mailpit (e-mails locais)** | `kubectl -n unir port-forward svc/mailpit 18025:8025` → <http://localhost:18025> | <http://localhost:18025> |
| **Qdrant Dashboard (RAG)** | `kubectl -n unir port-forward svc/qdrant 16333:6333` → <http://localhost:16333/dashboard> | <http://localhost:16333/dashboard> |

**Contas iniciais (senha padrão `123`, salvas em `config/local-demo-accounts.json` ignorado pelo Git):**
- **Administrador:** `admin@gmail.com` (`USER` + `PLATFORM_ADMIN`)
- **Professores verificados (modo `demo`):** `professor1@gmail.com` até `professor10@gmail.com` (5 no `DCC`, 5 no `DEG`)
- **Alunos (modo `demo`):** `aluno1@gmail.com` até `aluno40@gmail.com` (20 no `DCC`, 20 no `DEG`)

---

## Variáveis de ambiente (`.env`)

Todas as variáveis lidas pelos bootstraps (`scripts/k8s-up.sh` e `scripts/compose-up.sh`) estão declaradas em [config/local.env.example](config/local.env.example):

| Variável | Padrão local | Obrigatória? | Finalidade |
| --- | --- | --- | --- |
| `UNIR_K8S_PORT` / `UNIR_KIND_CLUSTER` | `18080` / `unir-local` | Não | Porta do Ingress Traefik e nome do cluster no modo Kubernetes. |
| `WEB_PORT` / `ADMIN_WEB_PORT` / `GATEWAY_PORT` / `KEYCLOAK_PORT` | `15173` / `15175` / `18084` / `18081` | Não | Portas expostas em `localhost` no modo Docker Compose. |
| `UNIR_SEED_MODE` | `demo` | Não | Modo de inicialização: `demo` ou `clean`. |
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
- **[Infraestrutura Kubernetes (`docs/KUBERNETES.md`)](docs/KUBERNETES.md)** — topologia do cluster `kind`, manifests `00`–`10`, PVCs, Secrets e comandos operacionais.
- **[Infraestrutura Docker Compose (`docs/DOCKER.md`)](docs/DOCKER.md)** — execução completa sem Kubernetes via `compose.yaml`, portas, volumes e comandos operacionais.
- **[Qualidade e Pipeline (`docs/QUALITY.md`)](docs/QUALITY.md)** — como rodar a pipeline de qualidade (`make ci`) e o que cada check valida em cada serviço.
- **[Contratos HTTP e de Mensageria (`docs/contracts/`)](docs/contracts/)** e **[Especificação OpenAPI (`docs/api/openapi.yaml`)](docs/api/openapi.yaml)**.
- **[Relatório Técnico GCC129 (`docs/relatorio-tecnico-gcc129.md`)](docs/relatorio-tecnico-gcc129.md)**.

---

## Sistemas da plataforma

| Sistema | Stack | Responsabilidade principal | Documentação |
| --- | --- | --- | --- |
| **Campus** | Ruby on Rails + PostgreSQL | Estrutura institucional (universidade, unidades, departamentos, cursos, semestres), perfis de usuários, verificação docente, entidades, comunidades, feed/enquetes, notificações e autorização contextual. | [campus/README.md](campus/README.md) |
| **Engagement** | Java 21 / Spring Boot + PostgreSQL + MongoDB + RabbitMQ | Eventos, oportunidades, inscrições, esportes universitários (Copa 32 / Liga 10, código 24h + Free Agents, mata-mata com agregado e pênaltis, presença em partidas), Outbox transacional e **CQRS** em MongoDB. | [engagement/README.md](engagement/README.md) |
| **Payment** | Go + PostgreSQL + RabbitMQ | Event Store + projeção de cobranças + Outbox para inscrições pagas e estornos (`REFUNDED`) via **provedor PIX simulado** (`SimulatedPixProvider`, sem dinheiro real). | [payment/README.md](payment/README.md) |
| **Access** | Rust + PostgreSQL + RabbitMQ | Credenciamento de eventos, tickets, tokens QR com hash e lista/histórico de presença (`NO_SHOW`). | [access/README.md](access/README.md) |
| **AI / RAG** | Python / FastAPI / LangChain + Qdrant + FastEmbed + Gemini | Indexação vetorial idempotente de eventos/oportunidades, tool de consulta ao vivo e geração via `gemini-3.5-flash` com fallback degradado explícito. | [ai-rag/README.md](ai-rag/README.md) |
| **API Gateway** | Java 21 / Spring Cloud Gateway | Ponto único de entrada HTTP (`/api/v1/**`), validação JWT RS256 (Keycloak), controle de papéis (`USER` / `PLATFORM_ADMIN`) e CORS. | [gateway/README.md](gateway/README.md) |
| **Web BFF** | Node.js / Fastify / TypeScript | Backend for Frontend do cliente `web` (sem banco próprio), composição de chamadas, enriquecimento de leitura (tickets, nomes na presença, títulos de pagamentos), sincronização de notificações de estorno e sanitização. | [web-bff/README.md](web-bff/README.md) |
| **Admin BFF** | Node.js / Fastify / TypeScript | Backend for Frontend exclusivo do `admin-web` (`PLATFORM_ADMIN`), com agregação institucional e gestão esportiva. | [admin-bff/README.md](admin-bff/README.md) |
| **Web** | React / TypeScript / Vite | Aplicação principal para alunos, professores e organizadores contextuais, com central **Meus eventos** (`/meus-eventos`), **Meus tickets** (próximos, anteriores e cancelados), notificações (incluindo estornos), modais de confirmação, modal unificado de presença/QR, checkout Pix integrado e Assistente UNIR (RAG). | [web/README.md](web/README.md) |
| **Administration** | React / TypeScript / Vite | Painel institucional (`PLATFORM_ADMIN`) para gerenciar universidade, unidades, departamentos, cursos, semestres, gestores, solicitações e gestão esportiva (incluindo QR + lista de presença). | [admin-web/README.md](admin-web/README.md) |
| **Keycloak Theme** | Keycloakify / React | Identidade visual UNIR para login, cadastro, recuperação de conta e Account v3 do Keycloak. | [keycloak-theme/README.md](keycloak-theme/README.md) |

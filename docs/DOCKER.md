# Infraestrutura Local com Docker Compose (sem Kubernetes) — UNIR

Além do cluster Kubernetes local (`kind`, documentado em [docs/KUBERNETES.md](KUBERNETES.md)), toda a plataforma UNIR pode ser executada diretamente com **Docker Compose** (`compose.yaml`), sem precisar instalar `kind` ou `kubectl`.

---

## 1. Pré-requisitos

- **Docker Engine** com plugin **Docker Compose v2** (`docker compose`);
- `make`, `python3` e `curl` no `PATH`;
- Conexão com a internet no primeiro boot (para baixar imagens base, dependências e o modelo local de embeddings do FastEmbed).
- **Não** é necessário instalar Java, Ruby, Go, Rust ou Node.js no host para rodar a aplicação.

> [!NOTE]
> Evite rodar Docker Compose e Kubernetes (`kind`) ao mesmo tempo se você tiver pouca RAM disponível — ambos sobem os 21 serviços completos da plataforma. Para parar o cluster `kind` antes de subir o Compose, use `make k8s-down`.

---

## 2. Como subir, alternar modo e resetar

Assim como no Kubernetes, o Docker Compose oferece **dois modos** limpos de inicialização:

| Modo | Comando (subir / atualizar) | Comando (zerar volumes e subir do zero) | O que vem no banco |
| --- | --- | --- | --- |
| **Demo completa** (apresentação) | `make docker-demo` | `make docker-reset-demo` | Universidade (`UFLA`), **1 admin** (`admin@gmail.com`), **10 professores verificados** (`professor1..10@gmail.com`), **40 alunos** (`aluno1..40@gmail.com`), `ICET`, `DCC`, `DEG`, cursos, comunidades, entidades, **publicações e conversas no feed**, **2 eventos acadêmicos**, **2 oportunidades**, **2 ligas de tênis de mesa em duplas** e **Qdrant/RAG indexado**. |
| **Zerado (usuário real / manual)** | `make docker-clean` | `make docker-reset-clean` | Apenas a Universidade configurada + **1 conta admin** (`admin@gmail.com` / `123`) para operar e cadastrar tudo do zero. |

### Outros comandos úteis

```bash
# Reconstruir todas as imagens locais após alterar código antes de subir
UNIR_DOCKER_REBUILD=true make docker-demo
# ou no modo limpo:
UNIR_DOCKER_REBUILD=true make docker-clean

# Parar os containers preservando os volumes locais
make docker-down

# Parar os containers e apagar todos os volumes locais (bancos, RabbitMQ, Qdrant)
./scripts/compose-down.sh --volumes

# Executar a demonstração ao vivo da Saga (pagamento + CQRS + estorno) contra o Compose
make docker-demo-saga

# Ver status e logs dos serviços
docker compose ps
docker compose logs -f gateway web-bff engagement
```

---

## 3. Portas e acessos locais (Docker Compose)

No modo Docker Compose não há Traefik Ingress; cada interface e ferramenta de apoio fica acessível diretamente em `localhost`:

| Interface / Serviço | Endereço padrão | Observação |
| --- | --- | --- |
| **UNIR Web** | <http://localhost:15173> | Aplicação principal (alunos, professores e organizadores) |
| **UNIR Administration** | <http://localhost:15175> | Painel `PLATFORM_ADMIN` (`admin@gmail.com` / `123`) |
| **API Gateway** | <http://localhost:18084/api/v1/...> | Ponto único de entrada HTTP autenticado |
| **Keycloak OIDC** | <http://localhost:18081/realms/unir/.well-known/openid-configuration> | Provedor de identidade e login |
| **Painel RabbitMQ** | <http://localhost:15672> | Usuário `unir` / senha `unir-local-only` (ou `.env`) |
| **Mailpit (e-mails locais)** | <http://localhost:18025> | Captura e-mails enviados pelo Keycloak |
| **Qdrant Dashboard** | <http://localhost:16333/dashboard> | Banco vetorial do Assistente RAG |
| **AI / RAG API** | <http://localhost:18090/health/ready> | Serviço FastAPI + LangChain + FastEmbed |

**Contas iniciais (senha padrão `123`, salvas em `config/local-demo-accounts.json` ignorado pelo Git):**
- **Administrador:** `admin@gmail.com` (`USER` + `PLATFORM_ADMIN`)
- **Professores verificados (modo `demo`):** `professor1@gmail.com` até `professor10@gmail.com`
- **Alunos (modo `demo`):** `aluno1@gmail.com` até `aluno40@gmail.com`

---

## 4. Variáveis de ambiente e personalização

O script [scripts/compose-up.sh](../scripts/compose-up.sh) lê automaticamente `.env` (se existir na raiz) ou usa os valores padrão de [config/local.env.example](../config/local.env.example).

Para ativar o Gemini no Assistente RAG ou customizar portas/senhas:

```bash
cp config/local.env.example .env
# Edite GEMINI_API_KEY ou as portas opcionais (WEB_PORT, ADMIN_WEB_PORT, GATEWAY_PORT, KEYCLOAK_PORT)
make docker-demo
```

### Volumes persistentes criados pelo Compose

| Volume | Serviço |
| --- | --- |
| `campus_data` | PostgreSQL do `campus` |
| `engagement_data` | PostgreSQL do `engagement` (write model + Outbox) |
| `mongodb_data` | MongoDB do `engagement` (read model CQRS `event_views`) |
| `payment_data` | PostgreSQL do `payment` (Event Store + cobranças) |
| `access_data` | PostgreSQL do `access` (tickets e presenças) |
| `keycloak_db_data` | PostgreSQL do `keycloak` |
| `rabbitmq_data` | Filas e exchanges duráveis do `rabbitmq` |
| `qdrant_rag_data` | Coleção vetorial `unir_knowledge` do `qdrant` |
| `ai_rag_model_cache` | Cache do modelo ONNX do FastEmbed |

### Redes isoladas por camada (`compose.yaml`)

| Rede | Serviços conectados | Isolamento |
| --- | --- | --- |
| `edge` | `web`, `admin-web`, `gateway`, `keycloak` | Frontends alcançam apenas Gateway e Keycloak |
| `internal` | `gateway`, `web-bff`, `admin-bff`, `campus`, `engagement`, `payment`, `access`, `ai-rag`, `keycloak`, `keycloak-profile-config` | Comunicação interna HTTP/OIDC entre gateway, BFFs e domínios |
| `data` | `campus-db`, `engagement-db`, `payment-db`, `access-db`, `keycloak-db`, `engagement-read-db`, `rabbitmq`, `mailpit`, `qdrant` (+ serviços donos) | Frontends, Gateway e BFFs não possuem acesso direto aos bancos nem ao broker |

---

## 5. O que o `scripts/compose-up.sh` executa automaticamente

1. Sobe os 21 serviços definidos em [compose.yaml](../compose.yaml) (reutilizando as mesmas imagens locais `unir-*:local` usadas no Kubernetes).
2. Aguarda prontidão de Keycloak, Gateway, Engagement e Frontends.
3. Configura os clients `unir-web` e `unir-rag-sync` e provisiona as contas no Keycloak conforme o modo (`demo` ou `clean`).
4. Executa o seed do `campus` (`bin/rails db:seed`).
5. No modo `demo`, executa [scripts/populate-local-demo.py](../scripts/populate-local-demo.py) apontando para o Gateway (`18084`) e Keycloak (`18081`).
6. Reconstrói a projeção CQRS no MongoDB (`ENGAGEMENT_EVENT_PROJECTION_REBUILD_AND_EXIT=true`).
7. Aciona a indexação vetorial no `ai-rag` (`POST /api/v1/rag/ingest`) para deixar o Qdrant pronto.

---

## 6. Diferenças entre Docker Compose e Kubernetes (`kind`)

| Aspecto | Docker Compose (`make docker-*`) | Kubernetes (`make k8s-*`) |
| --- | --- | --- |
| **Roteamento** | Portas dedicadas em `localhost` (`15173`, `15175`, `18084`, `18081`) | Ingress Traefik unificado na porta `18080` (`localhost` e `admin.localhost`) |
| **Pré-requisitos** | Apenas Docker + Compose | Docker + `kubectl` + `kind` |
| **Escalabilidade / Demos K8s** | Instância única por serviço | Suporta `make k8s-scale-demo` (`1 → 3 → 1` réplicas) e `make k8s-verify` |
| **Paridade funcional** | 100% dos serviços, bancos, RabbitMQ, CQRS, Saga e RAG | 100% dos serviços, bancos, RabbitMQ, CQRS, Saga e RAG |

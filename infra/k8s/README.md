# UNIR — Infraestrutura Kubernetes Local (kind)

Este diretório contém os manifests Kubernetes nativos da plataforma **UNIR** para execução local em cluster **kind**, mantendo o isolamento de bancos de dados por serviço, autenticação OIDC pelo Keycloak, roteamento via Ingress → API Gateway → BFFs → Serviços de Domínio, e compatibilidade prévia com o read model MongoDB de CQRS.

## 1. Arquitetura no Kubernetes

Todos os recursos pertencem ao namespace `unir`:

| Camada                    | Recurso Kubernetes                                                                      | Serviço Interno (`ClusterIP`)                                        | Persistência (PVC)                     |
| ------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| **Ingress Controller**    | `Deployment/traefik-ingress` (`IngressClass: traefik`)                                  | `NodePort` `30080` / `hostPort: 80` → `127.0.0.1:18080`              | Stateless                              |
| **Ingress**               | `Ingress/unir-ingress`                                                                  | Roteia `localhost:18080`, `admin.localhost:18080`, `/api`, `/realms` | —                                      |
| **Clientes Web**          | `Deployment/web`, `Deployment/admin-web`                                                | `web:5173`, `admin-web:5173`                                         | Stateless                              |
| **Borda HTTP**            | `Deployment/gateway`                                                                    | `gateway:8080`                                                       | Stateless                              |
| **BFFs**                  | `Deployment/web-bff`, `Deployment/admin-bff`                                            | `web-bff:3000`, `admin-bff:3000`                                     | Stateless                              |
| **Domínios**              | `Deployment/campus`, `Deployment/engagement`, `Deployment/payment`, `Deployment/access` | `campus:3000`, `engagement:8080`, `payment:8080`, `access:8080`      | Stateless                              |
| **Autenticação e E-mail** | `Deployment/keycloak`, `Deployment/mailpit`                                             | `keycloak:8080` (`9000` health), `mailpit:1025`/`8025`               | Stateless                              |
| **Mensageria**            | `Deployment/rabbitmq`                                                                   | `rabbitmq:5672`                                                      | `PVC/rabbitmq-data`                    |
| **Bancos PostgreSQL**     | `Deployment/campus-db`, `engagement-db`, `payment-db`, `access-db`, `keycloak-db`       | `*:5432` (isolados, sem acesso público)                              | `PVC/*-db-data` (5 PVCs independentes) |
| **Read Model CQRS**       | `Deployment/engagement-read-db` (`mongo:7.0`)                                           | `engagement-read-db:27017` (interno)                                 | `PVC/engagement-read-db-data`          |
| **RAG**                   | `Deployment/ai-rag`, `Deployment/qdrant`                                                | `ai-rag:8090`, `qdrant:6333` (`ClusterIP`, sem rota direta no Ingress) | `PVC/qdrant-rag-data`                  |

Nenhum banco de dados ou broker RabbitMQ é exposto fora do cluster. O ambiente Kubernetes usa a porta `18080` no host (`127.0.0.1:18080`), permitindo que o ambiente Docker Compose (`15173`, `15175`, `18081`, `18084`) continue funcionando separadamente sem conflito de portas ou volumes.

## 2. Organização dos Manifests

- `00-namespace.yaml` — Namespace `unir`.
- `01-configmaps.yaml` — `unir-common-config` (URLs internas, OIDC issuer/JWKS, origens CORS) e `unir-cqrs-mongodb-config` (configuração externalizada do MongoDB para o CQRS do Engagement).
- `02-secrets.example.yaml` — Modelo de Secrets (`unir-db-credentials`, `unir-keycloak-credentials`, `unir-rabbitmq-credentials`, `unir-mongodb-credentials`) sem senhas reais versionadas. Os Secrets reais do cluster local são gerados por `scripts/k8s-up.sh` a partir de `.env` / `config/local.env.example`.
- `03-databases.yaml` — 5 instâncias PostgreSQL isoladas + 1 instância MongoDB (`engagement-read-db`) com PVCs dedicados.
- `04-rabbitmq-mailpit.yaml` — RabbitMQ com PVC e Mailpit.
- `05-keycloak.yaml` — Keycloak com importação do realm `unir` e probes em `/health/ready` e `/health/live` (porta `9000`).
- `06-domain-services.yaml` — `campus` (com `initContainer` `db-migrate` para evitar corrida de migrations), `engagement`, `payment` e `access`.
- `07-bffs-gateway.yaml` — `web-bff`, `admin-bff` e `gateway`.
- `08-frontends.yaml` — `web` e `admin-web`.
- `09-ingress.yaml` — RBAC, `IngressClass`, `Deployment` do controlador Traefik (`networking.k8s.io/v1`) e `Ingress/unir-ingress`.
- `10-ai-rag.yaml` — Qdrant com PVC persistente e AI/RAG somente em `ClusterIP`.

## 3. Comandos de Execução

### Subir o cluster completo, carregar imagens, aplicar manifests e popular dados de demonstração

```bash
./scripts/k8s-up.sh
```

Quando o código local mudar, reconstrua e recarregue as imagens dos serviços antes
da validação integrada:

```bash
UNIR_K8S_REBUILD=true ./scripts/k8s-up.sh
```

### Acessar as aplicações via Ingress

- **UNIR Web:** `http://localhost:18080`
- **UNIR Administration:** `http://admin.localhost:18080`
- **API Gateway:** `http://localhost:18080/api/v1/...`
- **Keycloak OIDC Discovery:** `http://localhost:18080/realms/unir/.well-known/openid-configuration`

As 8 contas locais de demonstração ficam em `config/local-demo-accounts.json` (geradas por `scripts/prepare-local-demo-accounts.py` e sincronizadas no Keycloak do cluster).

O bootstrap aplica seeds de demonstração de forma idempotente, reconstrói o read model do MongoDB a partir do PostgreSQL e sincroniza eventos/oportunidades ativos no Qdrant. O rebuild e a sincronização não removem volumes. O client interno de sincronização RAG recebe credencial local no Keycloak; tokens de usuário são validados separadamente para consultas.

### Executar validação ponta a ponta (OIDC, RAG com fontes reais, ciclo CQRS criar/editar/cancelar, inscrição, Access e persistência)

```bash
./scripts/k8s-verify.sh
```

### Demonstrar escalabilidade horizontal (1 → 3 → 1 réplicas no `web-bff` com distribuição verificada nos logs)

```bash
./scripts/k8s-scale-demo.sh
```

### Encerrar apenas o cluster de demonstração da UNIR

```bash
./scripts/k8s-down.sh
```

## 4. CQRS, RAG e limites de exposição

A infraestrutura do MongoDB (`engagement-read-db`) já está provisionada e saudável no cluster com:

- **Deployment e PVC:** `Deployment/engagement-read-db` (`mongo:7.0`) + `PersistentVolumeClaim/engagement-read-db-data` (`/data/db`).
- **Service interno:** `engagement-read-db:27017` (`ClusterIP`).
- **ConfigMap (`unir-cqrs-mongodb-config`)** já injetado no `Deployment/engagement`:
  - `MONGODB_HOST=engagement-read-db`
  - `MONGODB_PORT=27017`
  - `MONGODB_DATABASE=unir_engagement_read`
  - `SPRING_DATA_MONGODB_HOST=engagement-read-db`
  - `SPRING_DATA_MONGODB_PORT=27017`
  - `SPRING_DATA_MONGODB_DATABASE=unir_engagement_read`
  - `ENGAGEMENT_READ_DB_HOST=engagement-read-db`
  - `ENGAGEMENT_READ_DB_PORT=27017`
  - `ENGAGEMENT_READ_DB_NAME=unir_engagement_read`
- **Secret (`unir-mongodb-credentials`)** já injetado no `Deployment/engagement`:
  - `MONGODB_USERNAME`
  - `MONGODB_PASSWORD`
  - `MONGODB_URI=mongodb://<user>:<password>@engagement-read-db:27017/unir_engagement_read?authSource=admin`
  - `SPRING_DATA_MONGODB_URI=mongodb://<user>:<password>@engagement-read-db:27017/unir_engagement_read?authSource=admin`

O `Deployment/engagement` usa as URIs e credenciais do Secret listado acima. Após os seeds SQL, `scripts/k8s-up.sh` executa o runner `engagement.event-projection.rebuild-and-exit=true`, que reidrata a coleção `event_views` incluindo registros cancelados. Escritas novas seguem PostgreSQL → Outbox → RabbitMQ → consumer → MongoDB. A listagem ativa usa o read model; os detalhes mantêm o histórico.

AI/RAG usa `ENGAGEMENT_URL=http://engagement:8080` e `QDRANT_URL=http://qdrant:6333`. A ingestão é acionada pelo bootstrap via `X-RAG-Sync-Token`, mas usa um token separado de client credentials (`unir-rag-sync`) para ler APIs autenticadas do Engagement. Consultas aceitam somente JWT de usuário assinado pelo Keycloak, com emissor configurado, validade, client `unir-web` e role `USER`/`PLATFORM_ADMIN`. O Web BFF preserva o JWT até AI/RAG. O Gateway publica somente `POST /api/v1/web/rag/query`; ingestão, tool ao vivo e avaliação não são rotas de Ingress. Sem `GEMINI_API_KEY`, a consulta retorna documentos e IDs reais em `FALLBACK_RETRIEVAL_ONLY`, sem simular texto do modelo.

# Infraestrutura Kubernetes (`kind`) — UNIR

Toda a execução local da plataforma UNIR é padronizada em **Kubernetes** usando **kind** (*Kubernetes IN Docker*), com manifests nativos em [`infra/k8s/`](../infra/k8s/) e bootstrap automatizado em [`scripts/k8s-up.sh`](../scripts/k8s-up.sh).

---

## 1. Como funciona o cluster local e por que ainda existe `docker build`

O Kubernetes **orquestra e executa containers**, mas **não constrói imagens OCI**. Em ambientes de produção, uma pipeline de CI faz `docker build` + `docker push` para um container registry remoto (como GHCR, Docker Hub ou ECR) e o cluster faz `pull` dessas imagens.

No ambiente local em `kind`:
1. O nó do cluster (`unir-local-control-plane`) roda dentro de um container no Docker Desktop com `containerd` interno;
2. `scripts/k8s-up.sh` executa `docker build` para construir as imagens locais (`unir-*:local`) e as importa diretamente no `containerd` do nó via `docker save ... | docker exec ... ctr --namespace=k8s.io images import`;
3. Os manifests usam `imagePullPolicy: Never` para as imagens `unir-*:local` (evitando qualquer tentativa de pull externo) e `IfNotPresent` para imagens de terceiros (`postgres`, `mongo`, `rabbitmq`, `qdrant`, `mailpit`, `traefik`).

Toda a operação dos serviços (deploy, rede, DNS interno, Secrets, ConfigMaps, volumes, probes, logs e escala) acontece **100% dentro do Kubernetes** via `kubectl`.

---

## 2. Topologia do namespace `unir`

| Camada | Workloads (`Deployment`) | Service (`ClusterIP` / `NodePort`) | Persistência (`PVC`) |
| --- | --- | --- | --- |
| **Ingress Controller** | `traefik-ingress` (`traefik:v3.2`) | `NodePort` `30080` + `hostPort: 80` → `127.0.0.1:18080` | Stateless |
| **Ingress** | `Ingress/unir-ingress` (`IngressClass: traefik`) | Roteia `localhost:18080`, `admin.localhost:18080`, `/api`, `/realms` | — |
| **Frontends** | `web`, `admin-web` | `web:5173`, `admin-web:5173` (`ClusterIP`) | Stateless |
| **Borda HTTP & BFFs** | `gateway`, `web-bff`, `admin-bff` | `gateway:8080`, `web-bff:3000`, `admin-bff:3000` (`ClusterIP`) | Stateless |
| **Serviços de Domínio** | `campus`, `engagement`, `payment`, `access` | `campus:3000`, `engagement:8080`, `payment:8080`, `access:8080` (`ClusterIP`) | Stateless |
| **IA / RAG** | `ai-rag`, `qdrant` | `ai-rag:8090`, `qdrant:6333` (`ClusterIP`, sem rota no Ingress) | `ai-rag-model-cache` (2Gi), `qdrant-rag-data` (2Gi) |
| **Identidade & E-mail** | `keycloak`, `mailpit` | `keycloak:8080` (`9000` health), `mailpit:1025`/`8025` (`ClusterIP`) | Stateless (usa `keycloak-db`) |
| **Mensageria** | `rabbitmq` | `rabbitmq:5672` (AMQP), `rabbitmq:15672` (Management) (`ClusterIP`) | `rabbitmq-data` (1Gi) |
| **Bancos PostgreSQL** | `campus-db`, `engagement-db`, `payment-db`, `access-db`, `keycloak-db` | `*:5432` (`ClusterIP`, isolados) | 5 PVCs independentes (1Gi cada) |
| **Read Model CQRS** | `engagement-read-db` (`mongo:7.0`) | `engagement-read-db:27017` (`ClusterIP`) | `engagement-read-db-data` (1Gi) |

---

## 3. Organização dos manifests (`infra/k8s/`)

- `00-namespace.yaml` — Namespace `unir`.
- `01-configmaps.yaml` — `unir-common-config` (URLs internas, OIDC issuer/JWKS, origens CORS) e `unir-cqrs-mongodb-config` (parâmetros do read model MongoDB).
- `02-secrets.example.yaml` — Modelo ilustrativo de Secrets sem senhas reais. Os Secrets reais do cluster são gerados pelo `scripts/k8s-up.sh` a partir de `.env` ou `config/local.env.example`.
- `03-databases.yaml` — 5 bancos PostgreSQL isolados + 1 MongoDB (`engagement-read-db`) com PVCs e `strategy: Recreate`.
- `04-rabbitmq-mailpit.yaml` — RabbitMQ persistente e Mailpit.
- `05-keycloak.yaml` — Keycloak com importação do realm `unir` (`ConfigMap/unir-keycloak-realm`) e health probes na porta `9000`.
- `06-domain-services.yaml` — `campus` (com `initContainer` `db-migrate` executando `bin/rails db:migrate` antes do servidor Rails), `engagement`, `payment` e `access`.
- `07-bffs-gateway.yaml` — `web-bff`, `admin-bff` e `gateway`.
- `08-frontends.yaml` — `web` e `admin-web`.
- `09-ingress.yaml` — `ServiceAccount`, `ClusterRole`, `ClusterRoleBinding`, `IngressClass: traefik`, `Deployment/traefik-ingress` e `Ingress/unir-ingress`.
- `10-ai-rag.yaml` — `qdrant` e `ai-rag` com PVCs para vetores e cache de embeddings FastEmbed.

---

## 4. O que ESTÁ implementado vs. o que NÃO está implementado

### Implementado no cluster local
- Namespace dedicado (`unir`), isolamento por `ClusterIP` (nenhum banco, broker ou serviço interno exposto fora do cluster) e entrada única via `Ingress` (Traefik v3.2 + RBAC);
- 9 `PersistentVolumeClaims` independentes (persistência preservada entre reinicializações de pods);
- Separação entre `ConfigMaps` e `Secrets` gerados fora do Git;
- `readinessProbe` e `livenessProbe` em todos os serviços, bancos e infraestrutura;
- `initContainer` de migração no `campus`, Flyway no `engagement` e migrations automáticas em `payment` e `access`;
- Bootstrap idempotente em 2 modos (`demo` e `clean`), reconstrução da projeção CQRS e sincronização inicial do Qdrant;
- Escala horizontal manual validável em serviços stateless (`make k8s-scale-demo` escala `web-bff` de `1 → 3 → 1` réplicas);
- Validação estática de todos os manifests YAML com `kubeconform -strict` na pipeline (`make infra`).

### Não implementado (escopo de produção fora do cluster local `kind`)
- **TLS / HTTPS / cert-manager:** tráfego local roda em HTTP puro na porta `18080`;
- **Autoscaling automático (`HorizontalPodAutoscaler` / `metrics-server`):** o escalonamento de réplicas é manual via `kubectl scale`;
- **`resources.requests` e `resources.limits` de CPU/memória nos containers:** os pods compartilham livremente os recursos do Docker Desktop (apenas PVCs definem `storage`);
- **`NetworkPolicy`:** o tráfego externo é bloqueado por `ClusterIP`, mas dentro do namespace `unir` o isolamento entre serviços depende de JWT, RBAC e credenciais;
- **`StatefulSet` e alta disponibilidade de bancos/broker:** bancos e RabbitMQ rodam como `Deployment` com `replicas: 1` e `strategy: Recreate` (adequado a `kind` single-node);
- **Stack de observabilidade centralizada (Prometheus, Grafana, Loki, OpenTelemetry Collector):** diagnóstico é feito via `kubectl logs`, `kubectl describe` e painel do RabbitMQ;
- **Registry remoto e CD:** imagens são locais (`imagePullPolicy: Never`).

---

## 5. Operação e diagnóstico

### Subir, alternar modo e resetar
```bash
# Modo demo enxuta (Universidade + 1 admin + 10 professores verificados + 40 alunos + estrutura base)
make k8s-demo
make k8s-reset-demo

# Modo zerado (apenas Universidade + 1 admin admin@gmail.com / 123)
make k8s-clean
make k8s-reset-clean

# Reconstruir imagens após alteração de código
UNIR_K8S_REBUILD=true make k8s-demo

# Remover completamente o cluster local
make k8s-down
```

### Ativar ou atualizar `GEMINI_API_KEY` sem recriar o cluster
```bash
kubectl patch secret unir-rag-credentials -n unir --type=merge \
  -p '{"stringData":{"GEMINI_API_KEY":"SUA_CHAVE_AQUI"}}'
kubectl rollout restart deployment/ai-rag -n unir
kubectl rollout status deployment/ai-rag -n unir --timeout=90s
```

### Painel do RabbitMQ e comandos de inspeção
```bash
# Painel RabbitMQ em http://localhost:15673
kubectl -n unir port-forward svc/rabbitmq 15673:15672

# Estado geral de pods, serviços, volumes e ingress
kubectl -n unir get pods,svc,pvc,ingress

# Eventos recentes e logs de um pod
kubectl -n unir get events --sort-by=.lastTimestamp
kubectl -n unir logs deploy/engagement --tail=100
```

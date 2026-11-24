# Arquitetura da Plataforma UNIR

A UNIR é organizada como um conjunto de microsserviços independentes com **Database-per-Service**, autenticação centralizada via **Keycloak (OIDC / JWT RS256)**, entrada única via **Traefik Ingress + API Gateway + BFFs**, comunicação assíncrona confiável via **Transactional Outbox + RabbitMQ**, leitura separada de eventos via **CQRS (MongoDB)** e descoberta semântica via **RAG (Qdrant + Gemini)**.

---

## 1. Visão geral da comunicação HTTP (síncrona)

```mermaid
flowchart LR
    Browser["Navegador do Usuário"] --> Ingress["Traefik Ingress (:18080)"]

    Ingress -->|"localhost/"| Web["Web (React)"]
    Ingress -->|"admin.localhost/"| AdminWeb["Admin Web (React)"]
    Ingress -->|"/realms (OIDC)"| Keycloak["Keycloak + keycloak-db"]
    Ingress -->|"/api/v1/**"| Gateway["API Gateway (Spring Cloud Gateway)"]

    Gateway -->|"USER / PLATFORM_ADMIN"| WebBFF["Web BFF (Fastify)"]
    Gateway -->|"PLATFORM_ADMIN"| AdminBFF["Admin BFF (Fastify)"]

    WebBFF --> Campus["Campus (Rails)"]
    WebBFF --> Engagement["Engagement (Spring Boot)"]
    WebBFF --> Payment["Payment (Go)"]
    WebBFF --> Access["Access (Rust)"]
    WebBFF --> AiRag["AI / RAG (FastAPI)"]

    AdminBFF --> Campus
    AdminBFF --> Engagement

    Engagement -->|"Autorização contextual"| Campus
    AiRag -->|"Leitura paginada / Live tool"| Engagement

    Campus --- CampusDB[("campus-db\nPostgreSQL")]
    Engagement --- EngDB[("engagement-db\nPostgreSQL")]
    Engagement --- MongoDB[("engagement-read-db\nMongoDB CQRS")]
    Payment --- PayDB[("payment-db\nPostgreSQL")]
    Access --- AccDB[("access-db\nPostgreSQL")]
    AiRag --- Qdrant[("qdrant\nVector DB")]
```

---

## 2. Comunicação assíncrona: Outbox, Saga de Pagamento/Estorno, CQRS e Tickets

Toda mudança crítica que cruza fronteiras de serviço grava o estado de negócio e o evento de integração **na mesma transação PostgreSQL** (padrão *Transactional Outbox*). Publicadores dedicados enviam as mensagens ao exchange `unir.events` no **RabbitMQ** com confirmação de roteamento, e cada consumidor faz deduplicação idempotente antes de confirmar o ACK. Veja o detalhamento completo dos fluxos felizes, falhas e compensações em **[docs/SAGA.md](SAGA.md)**.

```mermaid
sequenceDiagram
    participant U as Usuário (Web)
    participant E as Engagement (PG + Outbox)
    participant R as RabbitMQ (unir.events)
    participant M as MongoDB (Read Model CQRS)
    participant P as Payment (Go Event Store)
    participant A as Access (Rust)

    Note over E,M: Projeção CQRS de Eventos
    E->>R: EventCreated / Updated / Cancelled (Outbox)
    R->>M: EventProjectionConsumer atualiza event_views

    Note over U,A: Saga Coreografada (Inscrição Paga — Evento ou Esporte)
    U->>E: POST inscrição paga (status PENDING_PAYMENT)
    E->>R: RegistrationPaymentRequested v1
    R->>P: Cria ChargeCreated + projeção PENDING (SimulatedPixProvider)
    U->>P: POST confirmação PIX simulada
    P->>R: PaymentConfirmed v1
    R->>E: Confirma inscrição/time (CONFIRMED)
    E->>R: RegistrationConfirmed v1 (para eventos com presença)
    R->>A: Cria ticket de presença (QR hash)

    Note over U,P: Compensação (Cancelamento de Evento/Campeonato ou Pagamento Expirado)
    U->>E: Cancelamento institucional (ou janela expirada)
    E->>R: EventCancelled / RefundRequested v1
    R->>P: Processa estorno simulado -> REFUNDED
    P->>R: RefundSucceeded v1
    R->>E: Fecha caso de compensação (COMPLETED)
    R->>A: Preserva histórico do ticket como cancelado
```

---

## 3. Fluxo do Assistente UNIR (AI / RAG)

```mermaid
flowchart LR
    Web["Web · Assistente UNIR"] -->|"POST /api/v1/web/rag/query (JWT)"| GW["Gateway"]
    GW --> BFF["Web BFF"]
    BFF -->|"POST /api/v1/rag/query (timeout 30s)"| RAG["AI / RAG (FastAPI + LangChain)"]

    RAG -->|"1. Embedding local (FastEmbed ONNX)"| Qdrant[("Qdrant\nunir_knowledge")]
    RAG -->|"2. Tool opcional ao vivo"| Engagement["Engagement\nGET /api/v1/events"]
    RAG -->|"3. Geração (timeout 20s + retry)"| Gemini["Google Gemini\ngemini-3.5-flash"]

    Gemini -->|"Sucesso"| RespOK["GENERATED\nResposta + citações [ID] + telemetria"]
    Gemini -->|"Indisponível / sem chave"| RespFB["FALLBACK_RETRIEVAL_ONLY\nDocumentos reais do Qdrant sem inventar texto"]
```

---

## 4. Regras e limites arquiteturais

1. **Database-per-Service estrito:** nenhum serviço acessa o banco de outro. Identificadores externos (`userId` = `sub` do Keycloak, `departmentId`, `eventId`, `registrationId`) são referências lógicas sem foreign key entre bancos.
2. **Identidade vs. Autorização contextual:**
   - **Keycloak** emite JWT RS256 com papéis globais (`USER`, `PLATFORM_ADMIN`).
   - **API Gateway** valida assinatura/validade/papel na borda e nega rotas não mapeadas (`denyAll`).
   - **Campus** é a fonte de verdade de autorização contextual (quem administra universidade, unidade, departamento, entidade, comunidade e quais professores têm afiliação `ACTIVE`). `Engagement` consulta o `Campus` com o token do usuário antes de criar/editar/cancelar recursos.
3. **BFFs sem estado e sem banco:** `web-bff` e `admin-bff` apenas adaptam/agregam chamadas para seus respectivos frontends e removem campos internos quando necessário (verificado automaticamente em `scripts/check-ts-architecture.mjs`).
4. **Limites de domínio explícitos:**
   - **Pagamentos:** `Payment` usa apenas `SimulatedPixProvider` (simulação determinística sem dinheiro real).
   - **Presença:** `Access` gerencia tickets e QR Code de **eventos**; o check-in de **partidas esportivas** pertence ao `Engagement`.
   - **CQRS:** listagens públicas de eventos leem do **MongoDB** (`event_views`); operações de escrita, gestão e inscrições leem/gravam no **PostgreSQL** do `Engagement`.

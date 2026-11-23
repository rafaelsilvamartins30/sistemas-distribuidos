# Engagement (`engagement`)

Serviço de domínio responsável por **Eventos**, **Inscrições**, **Oportunidades** e **Esportes Universitários** (modalidades, campeonatos e temporadas).

- **Stack:** Java 21 + Spring Boot + Flyway + PostgreSQL próprio (`engagement-db`) + **MongoDB** (`engagement-read-db`, read model CQRS) + RabbitMQ (`unir.events`).
- **Acesso:** interno no Kubernetes (`ClusterIP` `engagement:8080`), acessado pelo `Web BFF` e (para indexação/live tool) pelo `AI / RAG`.

---

## Como funciona e singularidades

1. **CQRS no domínio de Eventos (PostgreSQL escrita → Outbox → RabbitMQ → MongoDB leitura):**
   - Todas as escritas (`POST/PATCH/DELETE /api/v1/events`) acontecem no **PostgreSQL**, gravando o evento de domínio na tabela `outbox_events` dentro da **mesma transação**.
   - O `OutboxPublisher` envia as mensagens ao RabbitMQ com confirmação de roteamento; o `EventProjectionConsumer` atualiza a coleção `event_views` no **MongoDB** usando controle de versão (`aggregateVersion`) para manter consistência eventual idempotente.
   - As listagens públicas (`GET /api/v1/events`) leem exclusivamente do MongoDB (sem fallback silencioso para PostgreSQL — em falha do read model retorna `503`). Para reidratação após seeds ou manutenção, `ENGAGEMENT_EVENT_PROJECTION_REBUILD_AND_EXIT=true` reconstrói `event_views` a partir do PostgreSQL.
2. **Saga Coreografada de Pagamento e Estorno (Eventos e Esportes):**
   - Inscrições pagas (`INTERNAL_PAID` em eventos ou taxas de equipe/free agent em esportes) nascem em `PENDING_PAYMENT` com janela de pagamento (10 min) e reserva de vaga (15 min), gravando `RegistrationPaymentRequested` no Outbox.
   - Ao consumir `PaymentConfirmed` (com deduplicação por `messageId`), o serviço confirma a inscrição (`CONFIRMED`) ou dispara `RefundRequested` em caso de janela expirada/incompatibilidade.
   - Cancelar um evento (`DELETE /api/v1/events/{id}`) ou um campeonato (`POST /api/v1/sports-events/{contextType}/{id}/cancel`) marca os registros como `CANCELLED` e publica `EventCancelled` / `RegistrationCancelledByEvent` no Outbox, disparando estorno integral no `Payment` e preservação histórica no `Access`.
3. **Regras de Esportes Universitários:**
   - Formatos oficiais obrigatórios: **Copa** com **32 times** (8 grupos de 4 → Oitavas, Quartas, Semifinal e Final em Ida e Volta + Pênaltis) e **Temporada** com **10 times** (pontos corridos turno e returno, 18 rodadas).
   - **Código de convite 24h + Free Agents:** ao criar um time, o capitão define quantas vagas reservará por código (`inviteCode` válido por 24h); vagas não reservadas ou expiradas após 24h são liberadas automaticamente para a fila de Free Agents.
   - **Mata-mata (Agregado + Pênaltis):** na partida de Volta, o sistema soma o placar da Ida considerando o mando invertido; pênaltis (`homePenaltyScore` / `awayPenaltyScore`, sem igualdade) só são exigidos e persistidos quando o **placar agregado** empata.
   - **Check-in de partidas esportivas:** mantido neste serviço (não cria ticket no `Access`).

---

## Endpoints e contratos

- **Eventos e inscrições:** `GET/POST /api/v1/events`, `GET/PATCH/DELETE /api/v1/events/{eventId}`, `GET /api/v1/events/organizer-contexts`, `GET /api/v1/events/managed`, `POST /api/v1/events/{eventId}/registrations`, `GET /api/v1/registrations/me`, `DELETE /api/v1/registrations/{registrationId}`
- **Oportunidades:** `GET/POST /api/v1/opportunities`, `GET/PATCH/DELETE /api/v1/opportunities/{opportunityId}`, `GET /api/v1/opportunities/publisher-contexts`, `GET /api/v1/opportunities/managed`
- **Esportes:** `/api/v1/sports`, `/api/v1/competitions`, `/api/v1/seasons`, `/api/v1/sports-events/{contextType}/{contextId}/overview|teams|teams/join|free-agents|matches/generate|cancel`, `PATCH /api/v1/sports-events/{contextType}/{contextId}`, `PATCH /api/v1/sports-matches/{matchId}/score`, `POST /api/v1/sports-matches/{matchId}/checkin-token|checkins`
- **Contratos detalhados:**
  - [Saga Coreografada (Pagamentos, Confirmação e Estorno)](../docs/SAGA.md)
  - [Projeção CQRS de Eventos](../docs/contracts/event-projection-v1.md)
  - [Esportes v1](../docs/contracts/sports-v1.md)
  - [Oportunidades v1](../docs/contracts/opportunities-v1.md)
  - [Pagamento, Confirmação e Estorno](../docs/contracts/registration-payment-requested-v1.md) · [PaymentConfirmed](../docs/contracts/payment-confirmed-v1.md) · [Refund Flow](../docs/contracts/refund-flow-v1.md)
  - [Cancelamento de Evento](../docs/contracts/event-cancellation-v1.md) · [RegistrationConfirmed](../docs/contracts/registration-confirmed-v1.md) · [RegistrationCancelled](../docs/contracts/registration-cancelled-v1.md)

---

## Qualidade

```sh
make engagement
# ou dentro de engagement/:
make quality   # Spotless, Checkstyle, JUnit/SpringBootTest (H2), ArchUnit, PMD e SpotBugs
```

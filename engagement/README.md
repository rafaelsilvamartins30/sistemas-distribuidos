# Engagement

Serviço de domínio responsável por atividades/eventos, inscrições e processos seletivos de oportunidades da UNIR. Stack: Java 21, Spring Boot, Maven, PostgreSQL e Flyway.

## Endpoints

The Sports catalog is documented in [`docs/contracts/sports-v1.md`](../docs/contracts/sports-v1.md). Migration `V11__create_sports_catalog.sql` adds Sport, Competition, and Season; the endpoints are read-only and do not expose organizer management.

- `GET /health` verifica a conectividade com o banco PostgreSQL próprio (`unir_engagement`) e retorna `200`.
- `GET /api/v1/events?page=0&size=20` lista eventos ativos em ordem de início, no envelope paginado compartilhado. Eventos pagos externos com prazo encerrado não aparecem na descoberta; eventos cancelados não aparecem na listagem.
- `GET /api/v1/events/{eventId}` retorna os detalhes de um evento persistido (inclusive cancelado) ou `404`.
- `GET /api/v1/opportunities?page=0&size=20` lista oportunidades ativas em ordem de publicação, com filtros opcionais `q`, `category` e `publisherType`. A página aceita de 1 a 100 itens; `publisherType` aceita `PROFESSOR`, `DEPARTMENT` ou `ACADEMIC_ENTITY`. O prazo encerrado ou status diferente de `ACTIVE` remove o registro da lista.
- `GET /api/v1/opportunities/{opportunityId}` retorna detalhes persistidos inclusive após o prazo ou mudança de status, preservando o histórico consultável. O modelo e as regras estão em [`docs/contracts/opportunities-v1.md`](../docs/contracts/opportunities-v1.md).
- `GET /api/v1/opportunities/publisher-contexts` consulta no Campus, com o token original do usuário, os contextos de publicação disponíveis.
- `POST /api/v1/opportunities` publica em um contexto retornado pelo Campus. Engagement confere novamente `publisherType` e `publisherId`, gera `id`, `createdAt` e `ACTIVE`, e falha fechado se Campus estiver indisponível. `COMMUNITY` é proibida. Não há candidatura interna.
- A autorização de departamento/entidade vem dos vínculos mantidos pelo Campus; a autorização docente exige `ProfessorAffiliation` `ACTIVE`, criada após aprovação de administrador do departamento. `user_type` autodeclarado não autoriza publicação.
- `POST /api/v1/events/{eventId}/registrations` inscreve o titular do JWT em evento `INTERNAL_FREE` (`201`, `CONFIRMED`) ou reserva vaga de evento `INTERNAL_PAID` (`201`, `PENDING_PAYMENT`). A reserva paga expõe `paymentDeadlineAt` (10 minutos) e `reservationExpiresAt` (15 minutos), com `RegistrationPaymentRequested` gravado no Outbox na mesma transação. Evento cancelado, prazo encerrado, modalidade não suportada, duplicidade ativa, lotação ou preço não configurado retornam `409`.
- `GET /api/v1/registrations/me?page=0&size=20` lista as inscrições do `sub` autenticado, incluindo os dados do evento e o histórico de cancelamento.
- `DELETE /api/v1/registrations/{registrationId}` realiza cancelamento lógico de inscrição gratuita até 24 horas antes do início. O registro permanece no banco com `CANCELLED_BY_USER` e `cancelledAt`; nenhum registro é apagado.
- Inscrição e cancelamento usam uma transação PostgreSQL e `SELECT FOR UPDATE` na linha do evento para serializar capacidade e mudanças de ocupação. Uma restrição única parcial impede mais de uma inscrição ativa por evento e usuário.
- Inscrições `PENDING_PAYMENT` ocupam capacidade somente até `reservationExpiresAt`; a expiração finaliza o estado e libera o índice de inscrição ativa. O publicador do Outbox envia mensagens persistentes ao RabbitMQ fora da transação de reserva, exige confirmação roteada e retenta eventos ainda não publicados. O payload v1 está em [`docs/contracts/registration-payment-requested-v1.md`](../docs/contracts/registration-payment-requested-v1.md).
- O consumidor da fila durável `engagement.payment-events` recebe `PaymentConfirmed` v1 em ACK manual: valida os identificadores, bloqueia o Event antes da Registration e confirma somente quando `paidAt` está entre `registeredAt` e `paymentDeadlineAt` e a mensagem é processada antes de `reservationExpiresAt`. O inbox deduplica por `messageId`; confirmações incompatíveis com o estado terminal não reativam a inscrição. Quando a inscrição não pode ser confirmada, Engagement grava/atualiza `payment_compensation_cases` e o pedido `RefundRequested` na Outbox dentro da mesma transação. Consome `RefundSucceeded` e `RefundFailed` com ACK após commit e deduplicação persistente; o estado da compensação passa por `PENDING`, `FAILED` e `COMPLETED` sem alterar o estado terminal da inscrição. O contrato está em [`docs/contracts/refund-flow-v1.md`](../docs/contracts/refund-flow-v1.md), e `PaymentConfirmed` em [`docs/contracts/payment-confirmed-v1.md`](../docs/contracts/payment-confirmed-v1.md).
- As rotas de eventos e inscrições exigem JWT válido do Keycloak com papel `USER` ou `PLATFORM_ADMIN`. `userId` vem exclusivamente do claim `sub`; Campus armazena esse valor em `keycloak_user_id` e o expõe como `UserProfile.id`, enquanto o UUID interno do perfil é distinto. Engagement mantém essa referência sem foreign key entre bancos.
- `DELETE` representa cancelamento de domínio, não exclusão física. Outras rotas permanecem negadas (`denyAll`).

## Ambiente local

No `compose.yaml`, `engagement` expõe a porta `18085` (`ENGAGEMENT_PORT`), conecta ao banco `engagement-db` (`unir_engagement`, porta `15434`) e publica pelo RabbitMQ interno `rabbitmq` (`unir.events`). O broker não expõe porta no host e usa o volume `rabbitmq_data`.
O Compose aponta `CAMPUS_URL` para `http://campus:3000`; fora do Compose, o padrão local é `http://localhost:3000`.

Para carregar os exemplos determinísticos locais, com o banco do Compose já iniciado e as migrations aplicadas:

```sh
docker compose exec -T engagement-db psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement < engagement/seed/local-events.sql
docker compose exec -T engagement-db psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement < engagement/seed/local-opportunities.sql
docker compose exec -T engagement-db psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement < engagement/seed/local-sports.sql
```

Os seeds usam IDs fixos e `ON CONFLICT DO NOTHING`, portanto podem ser repetidos sem sobrescrever ou remover dados existentes. Os links das oportunidades são domínios de demonstração `example.org`, não editais reais.

## Qualidade

Na pasta `engagement`: `make quality` (`mvn --batch-mode verify`) ou `make test` (`mvn --batch-mode test`), ou pela raiz com `make engagement`.
# Presence handoff

When a free registration is confirmed, or a paid registration is confirmed by a committed `PaymentConfirmed`, Engagement writes `RegistrationConfirmed` to the same transactional Outbox if attendance is enabled. The publisher sends it with routing key `engagement.registration.confirmed.v1`; Access creates its own attendance records idempotently. See [`../docs/contracts/registration-confirmed-v1.md`](../docs/contracts/registration-confirmed-v1.md).

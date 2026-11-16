# Engagement

Serviço de domínio responsável por atividades/eventos, inscrições e processos seletivos de oportunidades da UNIR. Stack: Java 21, Spring Boot, Maven, PostgreSQL e Flyway.

## Endpoints

- `GET /health` verifica a conectividade com o banco PostgreSQL próprio (`unir_engagement`) e retorna `200`.
- `GET /api/v1/events?page=0&size=20` lista eventos ativos em ordem de início, no envelope paginado compartilhado. Eventos pagos externos com prazo encerrado não aparecem na descoberta; eventos cancelados não aparecem na listagem.
- `GET /api/v1/events/{eventId}` retorna os detalhes de um evento persistido (inclusive cancelado) ou `404`.
- `POST /api/v1/events/{eventId}/registrations` inscreve o titular do JWT em evento `INTERNAL_FREE` (`201`, `CONFIRMED`) ou reserva vaga de evento `INTERNAL_PAID` (`201`, `PENDING_PAYMENT`). A reserva paga expõe `paymentDeadlineAt` (10 minutos) e `reservationExpiresAt` (15 minutos), com `RegistrationPaymentRequested` gravado no Outbox na mesma transação. Evento cancelado, prazo encerrado, modalidade não suportada, duplicidade ativa, lotação ou preço não configurado retornam `409`.
- `GET /api/v1/registrations/me?page=0&size=20` lista as inscrições do `sub` autenticado, incluindo os dados do evento e o histórico de cancelamento.
- `DELETE /api/v1/registrations/{registrationId}` realiza cancelamento lógico de inscrição gratuita até 24 horas antes do início. O registro permanece no banco com `CANCELLED_BY_USER` e `cancelledAt`; nenhum registro é apagado.
- Inscrição e cancelamento usam uma transação PostgreSQL e `SELECT FOR UPDATE` na linha do evento para serializar capacidade e mudanças de ocupação. Uma restrição única parcial impede mais de uma inscrição ativa por evento e usuário.
- Inscrições `PENDING_PAYMENT` ocupam capacidade somente até `reservationExpiresAt`; a expiração finaliza o estado e libera o índice de inscrição ativa. O publicador do Outbox envia mensagens persistentes ao RabbitMQ fora da transação de reserva, exige confirmação roteada e retenta eventos ainda não publicados. O payload v1 está em [`docs/contracts/registration-payment-requested-v1.md`](../docs/contracts/registration-payment-requested-v1.md).
- As rotas de eventos e inscrições exigem JWT válido do Keycloak com papel `USER` ou `PLATFORM_ADMIN`. `userId` vem exclusivamente do claim `sub`; Campus armazena esse valor em `keycloak_user_id` e o expõe como `UserProfile.id`, enquanto o UUID interno do perfil é distinto. Engagement mantém essa referência sem foreign key entre bancos.
- `DELETE` representa cancelamento de domínio, não exclusão física. Outras rotas permanecem negadas (`denyAll`).

## Ambiente local

No `compose.yaml`, `engagement` expõe a porta `18085` (`ENGAGEMENT_PORT`), conecta ao banco `engagement-db` (`unir_engagement`, porta `15434`) e publica pelo RabbitMQ interno `rabbitmq` (`unir.events`). O broker não expõe porta no host e usa o volume `rabbitmq_data`.

Para carregar os dois eventos locais determinísticos, com o banco do Compose já iniciado e a migration aplicada:

```sh
docker compose exec -T engagement-db psql -v ON_ERROR_STOP=1 -U unir -d unir_engagement < engagement/seed/local-events.sql
```

O seed usa IDs fixos e `ON CONFLICT DO NOTHING`, portanto pode ser repetido sem sobrescrever ou remover dados existentes.

## Qualidade

Na pasta `engagement`: `make quality` (`mvn --batch-mode verify`) ou `make test` (`mvn --batch-mode test`), ou pela raiz com `make engagement`.

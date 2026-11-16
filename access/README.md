# Access Service

Serviço de credenciamento e controle de acesso da plataforma UNIR, implementado em Rust. Consome `RegistrationConfirmed` v1 para criar sessão e entrada de presença, e atende check-in de participante no PostgreSQL exclusivo do Access.

## Execução local

```bash
make test
make quality
```

## Variáveis de ambiente

- `PORT` (padrão: `8080`)
- `DB_URL` (padrão: `postgres://unir:unir-local-only@localhost:15436/unir_access`)
- `KEYCLOAK_ISSUER_URI` (padrão local: `http://localhost:18081/realms/unir`)
- `KEYCLOAK_JWK_SET_URI` (padrão local: `http://localhost:18081/realms/unir/protocol/openid-connect/certs`)
- `RABBITMQ_URL` (opcional; substitui as variáveis separadas abaixo)
- `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD`

Ao iniciar, o Access aplica suas migrations aditivas e conecta ao exchange `unir.events`, consumindo a fila durável `access.registration-confirmed` pela routing key `engagement.registration.confirmed.v1`. O ACK ocorre após o commit no banco. Mensagens inválidas são rejeitadas sem requeue; falhas de banco são reenfileiradas após uma pausa curta.

O Access expõe `GET /api/v1/attendance/me?eventId=...` e `POST /api/v1/attendance/check-ins`; na Web, as rotas externas são encaminhadas por Gateway e Web BFF. Access valida a assinatura RS256, issuer e expiração do JWT e usa o `sub` autenticado para encontrar a entrada elegível.

A política inicial aprovada usa `startsAt`–`endsAt` como janela inclusiva. O token QR é opaco, aleatório, armazenado somente como hash e não é renovado automaticamente. Para criar ou substituir o QR compartilhado de um evento, um operador executa `docker compose exec access /app/access issue-qr <event-id>`. O novo QR invalida o anterior. Não existe endpoint público de emissão enquanto Campus não fornecer autorização contextual de organizador.

O contrato está em [`docs/contracts/registration-confirmed-v1.md`](../docs/contracts/registration-confirmed-v1.md) e o contrato HTTP em [`docs/contracts/attendance-check-in-v1.md`](../docs/contracts/attendance-check-in-v1.md). O consumidor não cria registros de presença para payloads com `attendanceEnabled = false`.

# Access Service

Serviço de credenciamento e controle de acesso da plataforma UNIR, implementado em Rust. Consome `RegistrationConfirmed` v1 para criar tickets de presença, `RegistrationCancelled` v1 para refletir cancelamentos individuais e `EventCancelled` v1 para preservar o histórico de eventos cancelados.

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

Ao iniciar, o Access aplica suas migrations aditivas e conecta ao exchange `unir.events`. A fila durável `access.registration-confirmed` recebe confirmações de inscrição, cancelamentos de inscrição e cancelamentos de evento. O ACK ocorre após o commit no banco. Mensagens inválidas são rejeitadas sem requeue; falhas de banco são reenfileiradas após uma pausa curta.

O Access expõe a consulta do ticket do usuário, emissão de QR individual, leitura/confirmação de presença e consulta histórica; as rotas externas passam pelo Gateway e Web BFF. Access valida assinatura RS256, issuer e expiração do JWT e usa o `sub` autenticado para encontrar a entrada elegível. Para operações do organizador, o `sub` também precisa coincidir com `createdByUserId` registrado pelo Engagement.

O prazo do evento encerra a janela de presença e tickets elegíveis passam para `NO_SHOW`; presenças confirmadas e cancelamentos permanecem no histórico. Tokens QR são aleatórios e somente seus hashes ficam persistidos. Emitir um QR novo substitui o anterior.

Os contratos estão em [`docs/contracts/registration-confirmed-v1.md`](../docs/contracts/registration-confirmed-v1.md), [`docs/contracts/registration-cancelled-v1.md`](../docs/contracts/registration-cancelled-v1.md) e [`docs/contracts/attendance-check-in-v1.md`](../docs/contracts/attendance-check-in-v1.md). O consumidor não cria tickets para eventos com `attendanceEnabled = false`.

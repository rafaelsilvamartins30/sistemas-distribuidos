# `RegistrationPaymentRequested` v1

Contrato de integração publicado pelo Engagement para que Payment crie uma cobrança para uma inscrição em evento pago interno.

## Transporte

- Exchange: `unir.events` (`topic`, durable).
- Routing key: `engagement.registration.payment-requested.v1`.
- Fila de demonstração: `payment.registration-requests` (durable, declarada pelo Engagement para reter mensagens até existir o consumidor Payment).
- Entrega: at-least-once. `messageId` é o UUID do registro de Outbox. Consumidores devem deduplicar por `messageId` e tratar `registrationId` como a chave idempotente da tentativa de pagamento.

## Envelope

`payloadJson` é um objeto JSON aninhado no envelope:

```json
{
  "messageId": "2b4869bb-6466-4f3e-97bf-a060bde93ea0",
  "eventType": "RegistrationPaymentRequested",
  "aggregateType": "Registration",
  "aggregateId": "8e871c70-cf63-45eb-a80a-a71a7098f1ed",
  "occurredAt": "2026-11-16T15:00:00Z",
  "schemaVersion": 1,
  "payloadJson": {
    "registrationId": "8e871c70-cf63-45eb-a80a-a71a7098f1ed",
    "eventId": "519926aa-0573-464a-b654-6483bcae2420",
    "userId": "keycloak-subject",
    "amountMinor": 2500,
    "currency": "BRL",
    "paymentDeadlineAt": "2026-11-16T15:10:00Z",
    "reservationExpiresAt": "2026-11-16T15:15:00Z"
  }
}
```

## Payload

| Campo | Tipo | Significado |
| --- | --- | --- |
| `registrationId` | UUID | Identifica a inscrição e a tentativa idempotente de pagamento. Uma nova tentativa após expiração tem outro UUID. |
| `eventId` | UUID | Evento cuja vaga foi reservada. |
| `userId` | string | Claim `sub` do JWT Keycloak; não é o UUID interno do perfil Campus. |
| `amountMinor` | inteiro | Valor congelado do evento em centavos. |
| `currency` | string | Sempre `BRL` neste contrato. |
| `paymentDeadlineAt` | timestamp ISO-8601 UTC | Limite de 10 minutos contado da criação da inscrição. |
| `reservationExpiresAt` | timestamp ISO-8601 UTC | Fim da reserva após 15 minutos, incluindo a tolerância para confirmação em trânsito. |

`Event.price` é um `Long` no modelo Java e `BIGINT` no PostgreSQL. Ambos armazenam unidades menores: R$ 25,00 é `2500`. O Engagement copia esse valor para `amountMinor` sem conversão decimal ou uso de ponto flutuante.

Engagement grava Registration e Outbox na mesma transação PostgreSQL. Um publicador separado envia a mensagem persistente e só grava `publishedAt` após publisher-confirm ACK e ausência de retorno de mensagem não roteada. Falhas permanecem no Outbox para nova tentativa; uma falha após ACK e antes da marcação pode produzir duplicata, conforme a semântica at-least-once.

Payment consome esta mensagem, valida o envelope e o payload, e usa `registrationId` como chave idempotente para criar uma cobrança `PENDING` pelo `SimulatedPixProvider`. O Event Store registra `ChargeCreated` e, na mesma transação PostgreSQL, Payment atualiza `ChargeProjection`, registra o `messageId` processado e grava a Outbox local.

O `SimulatedPixProvider` não movimenta dinheiro nem confirma pagamentos. A Outbox do Payment não é publicada nesta etapa, pois ainda não existe contrato de saída aprovado para o próximo serviço; não se deve inferir uma routing key ou payload a partir do evento de entrada.

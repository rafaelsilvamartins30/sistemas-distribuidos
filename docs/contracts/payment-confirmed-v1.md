# `PaymentConfirmed` v1

Evento publicado pelo Payment quando o provedor confirma a liquidação de uma cobrança Pix. Engagement usa o evento para confirmar a inscrição somente dentro dos prazos aprovados.

## Transporte

- Exchange: `unir.events` (`topic`, durable).
- Routing key: `payment.charge.confirmed.v1`.
- Fila consumidora: `engagement.payment-events` (durable).
- Entrega: at-least-once. O `messageId` identifica a publicação da Outbox; `chargeId` e `registrationId` identificam idempotentemente a cobrança e a inscrição.

## Envelope e payload

`payloadJson` é um objeto JSON aninhado no envelope comum:

```json
{
  "messageId": "2b4869bb-6466-4f3e-97bf-a060bde93ea0",
  "eventType": "PaymentConfirmed",
  "aggregateType": "Charge",
  "aggregateId": "937994f7-3bf7-55b3-8b2d-fd6b247787f4",
  "occurredAt": "2026-11-16T15:04:12Z",
  "schemaVersion": 1,
  "payloadJson": {
    "chargeId": "937994f7-3bf7-55b3-8b2d-fd6b247787f4",
    "registrationId": "8e871c70-cf63-45eb-a80a-a71a7098f1ed",
    "eventId": "519926aa-0573-464a-b654-6483bcae2420",
    "userId": "keycloak-subject",
    "amountMinor": 2500,
    "currency": "BRL",
    "paidAt": "2026-11-16T15:04:00Z"
  }
}
```

| Campo | Tipo | Significado |
| --- | --- | --- |
| `chargeId` | UUID | Identificador estável da cobrança no Payment; também é o `aggregateId` do envelope. |
| `registrationId` | UUID | Inscrição que originou a tentativa de pagamento. |
| `eventId` | UUID | Evento associado à inscrição. |
| `userId` | string | Claim `sub` do JWT Keycloak. |
| `amountMinor` | inteiro positivo | Valor congelado recebido no `RegistrationPaymentRequested`, em centavos. Payment não recalcula preço. |
| `currency` | string | `BRL`. |
| `paidAt` | timestamp ISO-8601 UTC | Horário efetivo em que o provedor confirmou o pagamento. É usado para comparar com `paymentDeadlineAt`. |
| envelope `occurredAt` | timestamp ISO-8601 UTC | Horário em que Payment registrou/publicou a confirmação; não substitui `paidAt`. |

Payment grava `PaymentConfirmed`, altera `ChargeProjection` para `PAID` e insere a Outbox na mesma transação PostgreSQL. O publicador envia mensagem persistente com publisher-confirm e marca a linha após o ACK; uma falha entre o ACK e essa marca pode gerar redelivery. Engagement deduplica pelo `messageId` e não repete a transição da inscrição.

Engagement só transiciona `PENDING_PAYMENT` para `CONFIRMED` se `registeredAt <= paidAt <= paymentDeadlineAt` e o processamento ocorrer antes de `reservationExpiresAt`. Pagamentos capturados que chegam após o fim da reserva, ou para inscrições canceladas/expiradas, permanecem sem reativar a inscrição. Engagement registra um caso em `payment_compensation_cases` e, na mesma transação, publica `RefundRequested` pela Outbox. Payment tenta o reembolso integral; o fluxo, os estados e as mensagens de resultado estão definidos em [`refund-flow-v1.md`](refund-flow-v1.md).

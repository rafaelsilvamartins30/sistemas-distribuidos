# Payment (`payment`)

Serviço de domínio responsável pelo **ciclo de vida de cobranças e estornos** de inscrições pagas (eventos e campeonatos esportivos) da UNIR.

- **Stack:** Go 1.27 + PostgreSQL próprio (`payment-db` / `unir_payment`) + RabbitMQ (`unir.events`).
- **Acesso:** interno no Kubernetes (`ClusterIP` `payment:8080`), acessado pelo `Web BFF` e por filas RabbitMQ.

---

## Como funciona e singularidades

1. **PIX simulado — NÃO há integração bancária real:**
   - O serviço define a interface `PixProvider`, mas a única implementação conectada é **`SimulatedPixProvider`**.
   - Ele gera códigos e recibos fictícios de forma determinística (chave de idempotência = `registrationId`), **não chama nenhum banco ou PSP externo** e **não movimenta dinheiro real**.
   - A confirmação do pagamento ocorre por ação explícita do usuário em `POST /api/v1/payments/{registrationId}/confirm` (habilitada somente quando `PAYMENT_ENV=local|test` e `PAYMENT_SIMULATED_CONFIRMATION_ENABLED=true`).
2. **Event Sourcing + Projeção + Outbox na mesma transação:**
   - Toda mudança de estado (`ChargeCreated`, `PaymentConfirmed`, `PaymentExpired`, `RefundRequested`, `RefundSucceeded`, `RefundFailed`) é gravada de forma *append-only* no Event Store PostgreSQL.
   - Na mesma transação ACID, atualiza a tabela de leitura `charge_projections`, grava a mensagem de saída em `payment_outbox` e registra `messageId` em `processed_messages` (garantindo idempotência contra redelivery).
3. **Participação na Saga Coreografada (pagamento e estorno):**
   - Consome `RegistrationPaymentRequested` v1 da fila `payment.registration-requests` (criando cobrança `PENDING` ou `EXPIRED` se `paymentDeadlineAt` já venceu).
   - Publica `PaymentConfirmed` v1 (`payment.charge.confirmed.v1`) quando confirmado.
   - Consome `RefundRequested` v1 da fila `payment.refund-requests` (acionado por cancelamento de evento, cancelamento de campeonato ou pagamento fora da janela), processa estorno idempotente (`unir-full-refund:<chargeId>`) até `REFUNDED` e publica `RefundSucceeded` / `RefundFailed`.

---

## Endpoints e contratos

- `GET /health` — conectividade com `payment-db`.
- `GET /api/v1/payments/me` — lista as cobranças do titular do JWT (validação RS256 completa).
- `POST /api/v1/payments/{registrationId}/confirm` — confirma cobrança PIX simulada do próprio usuário (usa o relógio do servidor para `paidAt`).
- **Contratos detalhados:**
  - [RegistrationPaymentRequested v1](../docs/contracts/registration-payment-requested-v1.md)
  - [PaymentConfirmed v1](../docs/contracts/payment-confirmed-v1.md)
  - [Fluxo de Estorno v1](../docs/contracts/refund-flow-v1.md)

---

## Qualidade

```sh
make payment
# ou dentro de payment/:
make quality   # gofmt, go vet, golangci-lint, go test e go build
```

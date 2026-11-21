# Payment

Serviço de domínio responsável pelo ciclo de vida de pagamentos das atividades pagas da UNIR. Stack: Go 1.27 e PostgreSQL.

## Endpoints

- `GET /health` verifica a conectividade com o banco PostgreSQL próprio (`unir_payment`) e retorna `200` (`503` se indisponível).
- `GET /api/v1/payments/me` lista as cobranças associadas ao `sub` do JWT autenticado.
- `POST /api/v1/payments/{registrationId}/confirm` confirma uma cobrança simulada do próprio usuário somente em `PAYMENT_ENV=local|test` com `PAYMENT_SIMULATED_CONFIRMATION_ENABLED=true`.

As rotas de usuário validam assinatura RS256, issuer, expiração e `sub` do token com `KEYCLOAK_ISSUER_URI` e `KEYCLOAK_JWK_SET_URI`. A identidade não é obtida decodificando claims sem verificar a assinatura.

O Payment consome a fila durável `payment.registration-requests`, ligada pelo Engagement à exchange `unir.events` e à routing key `engagement.registration.payment-requested.v1`. O contrato recebido é [`RegistrationPaymentRequested` v1](../docs/contracts/registration-payment-requested-v1.md).

Cada mensagem válida cria `ChargeCreated` no Event Store e, na mesma transação PostgreSQL, atualiza `charge_projections`, grava a saída local em `payment_outbox` e registra `messageId` em `processed_messages`. A deduplicação também usa `registrationId`, portanto uma segunda mensagem para a mesma tentativa não cria outra cobrança. Mensagens inválidas são rejeitadas sem requeue; falhas temporárias de persistência são re-enfileiradas. O ACK só ocorre após o commit.

O `SimulatedPixProvider` gera dados claramente fictícios e não movimenta dinheiro. A chave de idempotência do provedor é o `registrationId`, e o identificador interno da cobrança é determinístico para essa mesma tentativa. Se `paymentDeadlineAt` já tiver vencido ao processar a solicitação, Payment persiste `PaymentExpired` e a projeção `EXPIRED` sem chamar o provedor. O registro terminal também é idempotente para redelivery.

O pagamento simulado só pode ser confirmado explicitamente em `PAYMENT_ENV=local|test` com `PAYMENT_SIMULATED_CONFIRMATION_ENABLED=true`. A rota de usuário usa o relógio do Payment para gerar `paidAt`; o cliente não pode retroagir o horário para ultrapassar o prazo. A rota interna de controle `POST /local/simulated-payments/{registrationId}/confirm` pode receber `paidAt` para reproduzir cenários em testes e só é registrada com ambas as condições. A confirmação persiste `PaymentConfirmed`, atualiza a projeção para `PAID` e grava a Outbox na mesma transação. O publicador encaminha a Outbox para `payment.charge.confirmed.v1` com publisher-confirm e retry. O contrato está em [`PaymentConfirmed` v1](../docs/contracts/payment-confirmed-v1.md).

Payment consome também `RefundRequested` v1 da fila durável `payment.refund-requests`. Só reembolsa cobranças capturadas; valor e moeda vêm da projeção persistida, e a chave estável `unir-full-refund:<chargeId>` protege chamadas repetidas ao provedor. O `SimulatedPixProvider` devolve um recibo fictício e não movimenta dinheiro. Cada tentativa, falha ou sucesso é registrada como evento append-only; a projeção passa por `REFUND_PENDING`, `REFUND_FAILED` e `REFUNDED`, e os resultados são publicados pela Outbox. Uma falha do provedor permanece visível e retorna erro para reentrega/retry. O contrato das duas direções está em [`Refund flow v1`](../docs/contracts/refund-flow-v1.md).

## Ambiente local

No `compose.yaml`, `payment` expõe a porta `18086` (`PAYMENT_PORT`) e conecta ao banco `payment-db` (`unir_payment`, porta `15435`).

## Qualidade

Na pasta `payment`: `make quality` (`gofmt`, `go vet`, `golangci-lint`, `go test` e `go build`) ou `make test`, ou pela raiz com `make payment`.

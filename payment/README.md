# Payment

Serviço de domínio responsável pelo ciclo de vida de pagamentos das atividades pagas da UNIR. Stack: Go 1.27 e PostgreSQL.

## Endpoints

- `GET /health` verifica a conectividade com o banco PostgreSQL próprio (`unir_payment`) e retorna `200` (`503` se indisponível).
- Demais rotas exigem bearer token e permanecem fechadas (`404`) até a definição dos contratos de pagamento.

O Payment consome a fila durável `payment.registration-requests`, ligada pelo Engagement à exchange `unir.events` e à routing key `engagement.registration.payment-requested.v1`. O contrato recebido é [`RegistrationPaymentRequested` v1](../docs/contracts/registration-payment-requested-v1.md).

Cada mensagem válida cria `ChargeCreated` no Event Store e, na mesma transação PostgreSQL, atualiza `charge_projections`, grava a saída local em `payment_outbox` e registra `messageId` em `processed_messages`. A deduplicação também usa `registrationId`, portanto uma segunda mensagem para a mesma tentativa não cria outra cobrança. Mensagens inválidas são rejeitadas sem requeue; falhas temporárias de persistência são re-enfileiradas. O ACK só ocorre após o commit.

O `SimulatedPixProvider` gera dados claramente fictícios, não movimenta dinheiro e deixa a cobrança com status `PENDING`. Não há confirmação automática de pagamento. O Payment mantém a Outbox local necessária para a arquitetura, mas nenhum evento de saída é publicado nesta etapa: ainda não há contrato/routing key aprovados para esse sentido.

## Ambiente local

No `compose.yaml`, `payment` expõe a porta `18086` (`PAYMENT_PORT`) e conecta ao banco `payment-db` (`unir_payment`, porta `15435`).

## Qualidade

Na pasta `payment`: `make quality` (`gofmt`, `go vet`, `golangci-lint`, `go test` e `go build`) ou `make test`, ou pela raiz com `make payment`.

# Payment

Serviço de domínio responsável pelo ciclo de vida de pagamentos das atividades pagas da UNIR. Stack: Go 1.24 e PostgreSQL.

## Endpoints

- `GET /health` verifica a conectividade com o banco PostgreSQL próprio (`unir_payment`) e retorna `200` (`503` se indisponível).
- Demais rotas exigem bearer token e permanecem fechadas (`404`) até a definição dos contratos de pagamento.

## Ambiente local

No `compose.yaml`, `payment` expõe a porta `18086` (`PAYMENT_PORT`) e conecta ao banco `payment-db` (`unir_payment`, porta `15435`).

## Qualidade

Na pasta `payment`: `make quality` (`gofmt`, `go vet`, `golangci-lint`, `go test` e `go build`) ou `make test`, ou pela raiz com `make payment`.

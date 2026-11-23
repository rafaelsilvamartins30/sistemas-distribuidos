# Access (`access`)

Serviço de domínio responsável por **credenciamento, emissão de tickets, QR Code e registro de presença em eventos** da UNIR.

- **Stack:** Rust + PostgreSQL próprio (`access-db` / `unir_access`) + RabbitMQ (`unir.events`).
- **Acesso:** interno no Kubernetes (`ClusterIP` `access:8080`), acessado pelo `Web BFF` e via mensageria.

---

## Como funciona e singularidades

1. **Escopo estrito (Eventos vs. Esportes):**
   - `Access` gerencia tickets e presença **exclusivamente de eventos** com `attendanceEnabled = true`.
   - O check-in de **partidas esportivas** pertence ao `Engagement` e não gera tickets neste serviço.
2. **Criação assíncrona e histórico preservado:**
   - Consome `RegistrationConfirmed` v1, `RegistrationCancelled` v1 e `EventCancelled` v1 da fila durável `access.registration-confirmed` (com ACK somente após commit no PostgreSQL).
   - Cancelamentos de inscrição ou de evento não apagam registros: mantêm o histórico auditável. Após o encerramento da janela do evento, tickets elegíveis sem check-in passam para `NO_SHOW`.
3. **Segurança dos tokens QR:**
   - Os tokens QR são gerados aleatoriamente e **apenas seus hashes** são armazenados no banco; reemitir um QR invalida imediatamente o anterior.
   - Rotas de organizador validam JWT RS256 e conferem se `sub` coincide com `createdByUserId` propagado pelo `Engagement`.

---

## Endpoints e contratos

- Consulta do ticket do participante, emissão de QR individual, leitura/confirmação de presença pelo organizador ou por código do participante e histórico de tickets (expostos ao navegador via `Gateway → Web BFF`).
- **Contratos detalhados:**
  - [Saga Coreografada (Pagamentos, Confirmação e Estorno)](../docs/SAGA.md)
  - [Attendance & Check-in v1](../docs/contracts/attendance-check-in-v1.md)
  - [RegistrationConfirmed v1](../docs/contracts/registration-confirmed-v1.md)
  - [RegistrationCancelled v1](../docs/contracts/registration-cancelled-v1.md)
  - [EventCancellation v1](../docs/contracts/event-cancellation-v1.md)

---

## Qualidade

```sh
make access
# ou dentro de access/:
make quality   # cargo fmt --check, cargo clippy -D warnings e cargo test --locked
```

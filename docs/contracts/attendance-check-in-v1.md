# Attendance check-in v1

## Decisões

- Access supports `PARTICIPANT_SCANS_EVENT` and `ORGANIZER_SCANS_PARTICIPANT`.
- Check-in is allowed during the inclusive `startsAt`–`endsAt` window.
- QR tokens are opaque random values. Access stores only SHA-256 hashes. Issuing a replacement invalidates the previous token.
- JWT signature, issuer, expiry, and global `USER`/`PLATFORM_ADMIN` role are verified by Access. User identity comes from `sub`; clients do not send their own `userId`.
- The organizer rule compares the authenticated `sub` with `eventCreatorUserId` propagated from Engagement. It trusts the recorded creator; it does not grant rights based on request fields. Events without a recorded creator cannot use organizer QR actions.
- Repeated check-ins return the original confirmation. Each attendance entry has at most one persisted check-in.

Todas as rotas externas passam por Gateway → Web BFF → Access e preservam o Bearer JWT.

## Tickets do usuário

`GET /api/v1/attendance/tickets/me` retorna os tickets com `eventId`, `registrationId`, `eventTitle`, datas, modo, status e dados da presença. Inscrições pagas só aparecem após a confirmação do pagamento que publica `RegistrationConfirmed`. Ao consultar a lista, tickets ainda elegíveis de eventos encerrados são gravados como `NO_SHOW`.

O endpoint Web agregado `GET /api/v1/web/me/tickets` é servido pelo BFF: ele combina a lista de inscrições do Engagement com a lista de tickets do Access por `registrationId`. A tela `/tickets` separa eventos futuros e anteriores, mostra o histórico e apresenta a ação de QR apropriada.

## Modo `PARTICIPANT_SCANS_EVENT`

O organizador autenticado solicita ou substitui o QR compartilhado:

`POST /api/v1/attendance/events/{eventId}/qr`

A resposta traz `{ "token": "...", "qrSvg": "<svg...>" }` para exibição ao participante. O token em texto é retornado somente nessa emissão e fica armazenado apenas como hash.

O participante lê o QR na tela de ticket ou de evento:

`POST /api/v1/attendance/check-ins`

```json
{ "token": "<conteúdo opaco do QR do evento>" }
```

A leitura válida registra presença imediatamente para o usuário autenticado, sem uma segunda confirmação.

## Modo `ORGANIZER_SCANS_PARTICIPANT`

O participante emite seu QR individual:

`POST /api/v1/attendance/tickets/{eventId}/qr`

O token é associado à inscrição elegível do próprio usuário e pode ser substituído. O organizador lê esse código e solicita uma prévia:

`POST /api/v1/attendance/organizer-check-ins/preview`

```json
{ "token": "<conteúdo opaco do QR do participante>" }
```

A prévia retorna evento, inscrição, `participantUserId` e status. Ela não altera a presença. Depois de conferir presencialmente, o organizador confirma:

`POST /api/v1/attendance/organizer-check-ins/confirm`

```json
{ "token": "<conteúdo opaco do QR do participante>" }
```

Somente o organizador registrado no evento pode emitir seu QR compartilhado, consultar a prévia e confirmar a presença. O contrato de inscrição atualmente carrega o Keycloak `sub`, não o nome do perfil; por isso a prévia apresenta o identificador da conta até Campus disponibilizar uma consulta de perfil adequada.

## Cancelamento e histórico

`RegistrationCancelled` do Engagement muda um ticket elegível para `CANCELLED` e revoga o QR individual. `EventCancelled` continua cancelando os tickets elegíveis do evento. Presenças já confirmadas são mantidas no histórico. A documentação de `RegistrationCancelled` está em [`registration-cancelled-v1.md`](./registration-cancelled-v1.md).

## Erros

- `401`: Bearer ausente ou JWT inválido/expirado.
- `403`: role global ausente, QR inválido, participante sem ticket elegível ou usuário diferente do organizador registrado.
- `404`: ticket do usuário/evento não encontrado na consulta.
- `409`: sessão fechada/cancelada, fora da janela, modo incompatível ou ticket em estado terminal.
- `503`: PostgreSQL ou validação de JWT indisponível.

Erros usam `application/problem+json`. O Gateway limita essas operações a usuários `USER` ou `PLATFORM_ADMIN`; a checagem do organizador ocorre novamente no Access.

## Operação local

O comando local de suporte para gerar QR compartilhado segue disponível:

```bash
docker compose exec access /app/access issue-qr <event-id>
```

Para execução fora do Compose, use `cargo run -- issue-qr <event-id>` com `DB_URL` apontando para o PostgreSQL do Access. A tela Web usa `BarcodeDetector` quando disponível e oferece campo manual como fallback.

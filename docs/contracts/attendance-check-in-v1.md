# Attendance check-in v1

## Decisões

- O primeiro modo implementado é `PARTICIPANT_SCANS_EVENT`. `ORGANIZER_SCANS_PARTICIPANT` continua fora desta entrega e não possui endpoint público.
- Decisão inicial aprovada em 2026-11-16: `checkInOpensAt = Event.startsAt` e `checkInClosesAt = Event.endsAt`, com ambos os limites inclusivos. Essa política pode ser substituída por uma decisão posterior.
- Cada sessão tem um token QR aleatório opaco, válido somente durante a janela da sessão. Não há renovação automática. Uma emissão local nova substitui o hash anterior e invalida o QR anterior.
- O Access armazena somente SHA-256 do token. O token não aparece em respostas HTTP, logs ou tabelas. O comando local imprime o QR uma única vez em ASCII no terminal do operador.
- A identidade vem do `sub` de um JWT Keycloak validado (assinatura RS256, issuer e expiração). O cliente não envia `userId`. Access exige role global `USER` ou `PLATFORM_ADMIN` e usa o `sub` para localizar a `AttendanceEntry`.
- Um check-in repetido durante a sessão válida retorna a mesma confirmação. A linha da `AttendanceSession` é bloqueada na transação, `CheckIn.attendanceEntryId` é único e a atualização da entrada ocorre no mesmo commit.

## Operação de participante

Todas as rotas externas passam por Gateway → Web BFF → Access e preservam o Bearer JWT.

### Consultar presença própria

`GET /api/v1/web/attendance/me?eventId={uuid}`

O BFF encaminha para `GET /api/v1/attendance/me?eventId={uuid}`.

Resposta `200`:

```json
{
  "eventId": "10000000-0000-4000-8000-000000000001",
  "sessionId": "20000000-0000-4000-8000-000000000001",
  "attendanceEntryId": "30000000-0000-4000-8000-000000000001",
  "status": "ELIGIBLE",
  "registeredAt": "2027-01-15T12:00:00Z",
  "checkedAt": null
}
```

`404` indica que ainda não há uma entrada de presença para o usuário/evento.

### Registrar check-in pelo QR compartilhado

`POST /api/v1/web/attendance/check-ins`

O BFF encaminha para `POST /api/v1/attendance/check-ins`.

```json
{ "token": "<conteúdo opaco do QR>" }
```

Resposta `200`:

```json
{
  "checkInId": "40000000-0000-4000-8000-000000000001",
  "sessionId": "20000000-0000-4000-8000-000000000001",
  "attendanceEntryId": "30000000-0000-4000-8000-000000000001",
  "status": "ATTENDED",
  "checkedAt": "2027-06-15T17:30:00Z"
}
```

## Respostas de erro

- `401`: Bearer ausente, JWT inválido/expirado.
- `403`: role global ausente, QR inválido, ou usuário sem entrada elegível.
- `404`: entrada do usuário/evento não encontrada na consulta.
- `409`: sessão fechada/cancelada, fora da janela, modo ainda não suportado ou entrada em estado terminal.
- `503`: PostgreSQL ou validação de JWT indisponível.

Erros usam `application/problem+json`. O Gateway limita estas operações a usuários `USER` ou `PLATFORM_ADMIN`; Access valida o JWT e a mesma role quando recebe a chamada.

## Emissão local do QR

Não há rota de emissão para organizadores até existir autorização contextual no Campus. Um operador local emite/substitui o QR por UUID do Event:

```bash
docker compose exec access /app/access issue-qr <event-id>
```

Para execução fora do Compose, use `cargo run -- issue-qr <event-id>` com `DB_URL` apontando para o PostgreSQL do Access. O comando só funciona para sessão aberta em modo `PARTICIPANT_SCANS_EVENT`. A tela Web usa `BarcodeDetector` quando disponível e oferece campo manual como fallback.

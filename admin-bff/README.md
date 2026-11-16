# Admin BFF

BFF administrativo da plataforma UNIR, implementado em Fastify e TypeScript.

## Execução local

```bash
make test
make quality
```

## Variáveis de ambiente

- `PORT` (padrão: `3000`)
- `CAMPUS_URL` (padrão: `http://localhost:3000`)

`GET /api/v1/admin/me` encaminha o JWT recebido para `GET /users/me` no Campus
e preserva status, content-type e corpo da resposta. No Compose, `CAMPUS_URL`
aponta para `http://campus:3000`; a rota administrativa do Gateway exige
`PLATFORM_ADMIN`.

# Access Service

Serviço de credenciamento e controle de acesso (QR Code, check-in e emissão de certificados) da plataforma UNIR, implementado em Rust.

## Execução local

```bash
make test
make quality
```

## Variáveis de ambiente

- `PORT` (padrão: `8080`)
- `DB_URL` (padrão: `postgres://unir:unir-local-only@localhost:15436/unir_access`)

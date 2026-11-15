# UNIR

**UNIR — University Network for Integration and Relationships**

UNIR is a university platform focused on helping users discover and participate in communities, activities and opportunities.

## Main domains

- **User** — UNIR profile data; Keycloak handles authentication and identity.
- **Community** — university communities, managers, followers and public posts.
- **Activity** — events and activities with direct registration.
- **Opportunity** — opportunities with application and selection processes.
- **Payment** — payment lifecycle for paid activities.
- **Access** — QR credentials, access validation, check-in and attendance history.

## Main distributed flow

A paid activity registration may involve:

```text
Activity
  ↓ reserve registration / capacity
Payment
  ↓ confirm payment
Access
  ↓ issue credential
```

## Desenvolvimento local

Hoje o Compose sobe os componentes já implementados: Keycloak, Mailpit, User Service, Web BFF, Gateway, a aplicação web e seus bancos PostgreSQL separados. Novos microsserviços serão adicionados conforme o domínio for definido.

```sh
docker compose up --build -d
```

Web: http://localhost:15173 · Gateway: http://localhost:18084 · Web BFF: http://localhost:18083 · Keycloak: http://localhost:18081 · Mailpit: http://localhost:18025 · User Service: http://localhost:18082. As senhas e portas locais estão em `.env`, ignorado pelo Git. Em um clone novo, copie `config/local.env.example` para `.env` uma vez antes de subir. As instruções da API estão em [user-service/README.md](user-service/README.md) e [gateway/README.md](gateway/README.md).

## Verificações de qualidade

Use `make ci` na raiz para executar as mesmas verificações da CI. Os pré-requisitos, comandos por componente e convenções para novos serviços estão no [guia de qualidade](docs/QUALITY.md).

# UNIR

**UNIR — University Network for Integration and Relationships**

UNIR is a university platform focused on helping users discover and participate in communities, activities and opportunities.

## Main domains

- **Campus** — university structure, profiles, academic affiliations, entities, communities, feed and contextual authorization.
- **Engagement** — events and activities with direct registration, opportunities and university sports.
- **Payment** — payment lifecycle for paid activities.
- **Access** — QR credentials, access validation, check-in and attendance history.

Keycloak handles authentication and identity across the platform. Campus owns university profiles and community membership; it does not replace Keycloak identity.

## Main distributed flow

A paid activity registration may involve:

```text
Engagement
  ↓ reserve registration / capacity
Payment
  ↓ confirm payment
Access
  ↓ issue credential
```

## Desenvolvimento local

Campus (Rails API) é o serviço responsável pelos perfis, vínculos acadêmicos, comunidades e estrutura universitária. Web e Administration acessam seus perfis pelo fluxo Gateway → BFF → Campus. O Campus usa um banco PostgreSQL próprio.

O Compose sobe Keycloak, Mailpit, RabbitMQ, os quatro serviços de domínio (Campus, Engagement, Payment e Access), Web BFF, Admin BFF, Gateway, as aplicações Web e Administration (`admin-web`) e bancos PostgreSQL separados. RabbitMQ, serviços e bancos internos não publicam portas no host, exceto os que já fazem parte dos fluxos locais documentados.

```sh
docker compose up --build -d
```

Web: http://localhost:15173 · Administration: http://localhost:15175 · Gateway: http://localhost:18084 · Web BFF: http://localhost:18083 · Keycloak: http://localhost:18081 · Mailpit: http://localhost:18025 · Engagement: http://localhost:18085 · Payment: http://localhost:18086 · Access: http://localhost:18087. Campus e os bancos dos serviços são internos ao Compose. As senhas e portas locais estão em `.env`, ignorado pelo Git. Em um clone novo, copie `config/local.env.example` para `.env` uma vez antes de subir. Consulte os READMEs dos componentes para endpoints e comandos.

## Verificações de qualidade

Use `make ci` na raiz para executar as mesmas verificações da CI. Os pré-requisitos, comandos por componente e convenções para novos serviços estão no [guia de qualidade](docs/QUALITY.md).

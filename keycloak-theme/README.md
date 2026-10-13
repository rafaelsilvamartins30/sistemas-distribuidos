# Tema UNIR para Keycloak

Tema de login, cadastro, verificação de email e recuperação de acesso, feito com Keycloakify. O projeto usa as páginas padrão do Keycloakify com uma identidade visual própria em `src/login/main.css`. As mensagens vêm do Keycloak em português brasileiro.

## Usar com a infraestrutura local

Na raiz do repositório:

```sh
docker compose up --build -d
```

As credenciais locais ficam no `.env` da raiz; em um clone novo, use `config/local.env.example` como modelo.

Acesse http://localhost:18081/realms/unir/account ou inicie a autorização OIDC conforme `user-service/README.md`. O tema é configurado em `config/keycloak/unir-realm.json` para instalações novas. O importador não sobrescreve um realm existente.

## Desenvolvimento

Requer Node 22+, pnpm 11, JDK e Maven. Em `keycloak-theme/`:

```sh
pnpm install --frozen-lockfile
pnpm build-keycloak-theme
```

O JAR gerado fica em `dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar`. Para aplicar mudanças no Compose, rode `docker compose up --build -d keycloak` na raiz.
